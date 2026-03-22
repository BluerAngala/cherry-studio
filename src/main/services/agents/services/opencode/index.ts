import { execSync, spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import * as fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { loggerService } from '@logger'
import type { GetAgentSessionResponse } from '@types'

import type {
  AgentServiceInterface,
  AgentStream,
  AgentStreamEvent,
  AgentThinkingOptions
} from '../../interfaces/AgentStreamInterface'

const logger = loggerService.withContext('OpenCodeService')

type OpenCodeModel = {
  providerID: string
  modelID: string
}

type OpenCodeEvent = {
  type: string
  properties?: Record<string, any>
}

type OpenCodeMessageInfo = {
  id: string
  sessionID: string
  role?: string
  error?: { data?: { message?: string } }
}

type OpenCodePart = {
  id: string
  sessionID: string
  messageID: string
  type: 'text' | 'reasoning' | 'tool' | string
  text?: string
  callID?: string
  tool?: string
  state?: {
    status?: 'pending' | 'running' | 'completed' | 'error' | string
    input?: Record<string, unknown>
    output?: string
    error?: string
  }
}

type QueuedPartUpdate = {
  part: OpenCodePart
  delta?: string
}

const EMPTY_USAGE = {
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  inputTokenDetails: {
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    noCacheTokens: 0
  },
  outputTokenDetails: {
    textTokens: 0,
    reasoningTokens: 0
  }
}

function validateModelForOpenCode(model: string): { valid: boolean; error?: string } {
  if (!model || typeof model !== 'string') {
    return { valid: false, error: 'Model must be a non-empty string' }
  }

  const separatorIndex = model.indexOf(':')
  if (separatorIndex <= 0 || separatorIndex === model.length - 1) {
    return { valid: false, error: "Invalid model format. Expected: 'provider:model_id'" }
  }

  return { valid: true }
}

export function parseOpenCodeModel(model: string): OpenCodeModel {
  const separatorIndex = model.indexOf(':')
  if (separatorIndex <= 0 || separatorIndex === model.length - 1) {
    throw new Error(`Invalid model format: ${model}`)
  }

  return {
    providerID: model.slice(0, separatorIndex),
    modelID: model.slice(separatorIndex + 1)
  }
}

export function resolveStreamingDelta(previousText: string, nextText: string, explicitDelta?: string): string {
  if (typeof explicitDelta === 'string' && explicitDelta.length > 0) {
    return explicitDelta
  }

  if (!nextText || nextText === previousText) {
    return ''
  }

  if (nextText.startsWith(previousText)) {
    return nextText.slice(previousText.length)
  }

  return nextText
}

function isNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }

  const candidate = error as {
    status?: number
    statusCode?: number
    message?: string
  }

  return (
    candidate.status === 404 ||
    candidate.statusCode === 404 ||
    candidate.message?.toLowerCase().includes('not found') === true
  )
}

function isAbortError(error: unknown): boolean {
  if (!error) {
    return false
  }

  if (error instanceof Error) {
    return error.name === 'AbortError' || error.message.toLowerCase().includes('aborted')
  }

  return false
}

function findOpencodePath(): { command: string; args: string[] } | null {
  try {
    const result = execSync('where opencode 2>nul || which opencode 2>/dev/null', { encoding: 'utf-8' }).trim()
    if (result) {
      const systemPaths = result
        .split(/\r?\n/)
        .map((item) => item.trim().replace(/^"(.*)"$/, '$1'))
        .filter(Boolean)

      for (const systemPath of systemPaths) {
        const systemDir = path.dirname(systemPath)
        const bundledScriptPath = path.join(systemDir, 'node_modules', 'opencode-ai', 'bin', 'opencode')

        if (fs.existsSync(bundledScriptPath)) {
          logger.info('Found system opencode Node entrypoint', { path: bundledScriptPath })
          return { command: process.execPath, args: [bundledScriptPath] }
        }

        if (fs.existsSync(systemPath) && systemPath.toLowerCase().endsWith('.exe')) {
          logger.info('Found system opencode executable', { path: systemPath })
          return { command: systemPath, args: [] }
        }
      }
    }
  } catch {
    // Ignore and continue with bundled fallbacks.
  }

  const appRoot = process.cwd()
  const wrapperPaths = [
    path.join(appRoot, 'scripts', 'opencode-wrapper.js'),
    path.join(appRoot, '..', 'scripts', 'opencode-wrapper.js'),
    path.join(process.resourcesPath || '', 'scripts', 'opencode-wrapper.js')
  ]

  for (const wrapperPath of wrapperPaths) {
    if (fs.existsSync(wrapperPath)) {
      logger.info('Found opencode wrapper script', { path: wrapperPath })
      return { command: process.execPath, args: [wrapperPath] }
    }
  }

  const windowsBinaryPaths = [
    path.join(appRoot, 'node_modules', 'opencode-windows-x64', 'bin', 'opencode.exe'),
    path.join(appRoot, '..', 'app.asar.unpacked', 'node_modules', 'opencode-windows-x64', 'bin', 'opencode.exe'),
    path.join(
      process.resourcesPath || '',
      'app.asar.unpacked',
      'node_modules',
      'opencode-windows-x64',
      'bin',
      'opencode.exe'
    )
  ]

  for (const binaryPath of windowsBinaryPaths) {
    if (fs.existsSync(binaryPath)) {
      logger.info('Found bundled Windows opencode binary', { path: binaryPath })
      return { command: binaryPath, args: [] }
    }
  }

  const globalPaths = [
    path.join(os.homedir(), '.opencode', 'bin', 'opencode.exe'),
    path.join(os.homedir(), '.opencode', 'bin', 'opencode'),
    path.join(os.homedir(), 'AppData', 'Roaming', 'npm', 'opencode.cmd'),
    path.join(os.homedir(), 'AppData', 'Roaming', 'npm', 'opencode'),
    'C:\\Program Files\\nodejs\\opencode.cmd',
    'C:\\Program Files\\nodejs\\opencode'
  ]

  for (const opencodePath of globalPaths) {
    if (fs.existsSync(opencodePath)) {
      logger.info('Found global opencode executable', { path: opencodePath })
      return { command: opencodePath, args: [] }
    }
  }

  logger.error('Could not find opencode executable')
  return null
}

function buildSpawnEnv(command: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: process.env.PATH || ''
  }

  if (command === process.execPath || path.basename(command).toLowerCase().startsWith('electron')) {
    env.ELECTRON_RUN_AS_NODE = '1'
    env.ELECTRON_NO_ATTACH_CONSOLE = '1'
  }

  return env
}

class OpenCodeStream extends EventEmitter implements AgentStream {
  declare emit: (event: 'data', data: AgentStreamEvent) => boolean
  declare on: (event: 'data', listener: (data: AgentStreamEvent) => void) => this
  declare once: (event: 'data', listener: (data: AgentStreamEvent) => void) => this
}

export class OpenCodeService implements AgentServiceInterface {
  private client: any | null = null
  private server: { url: string; close: () => void } | null = null

  private async startOpencodeServer(): Promise<{ url: string; close: () => void }> {
    const opencodeConfig = findOpencodePath()

    if (!opencodeConfig) {
      throw new Error(
        'OpenCode CLI not found.\n' +
          'Please ensure OpenCode CLI is installed and available in PATH.\n' +
          'Install command: curl -fsSL https://opencode.ai/install | bash'
      )
    }

    const hostname = '127.0.0.1'
    const port = 0
    const { command, args: baseArgs } = opencodeConfig
    const args = [...baseArgs, 'serve', `--hostname=${hostname}`, `--port=${port}`]

    logger.info('Starting opencode server with', { command, args })

    return new Promise((resolve, reject) => {
      const proc = spawn(command, args, {
        env: buildSpawnEnv(command),
        windowsHide: true
      })

      const timeout = setTimeout(() => {
        proc.kill()
        reject(new Error('Timeout waiting for opencode server to start'))
      }, 10000)

      let output = ''
      let resolved = false

      const resolveIfListening = (text: string) => {
        const lines = text.split('\n')
        for (const line of lines) {
          if (!line.includes('http://') && !line.includes('https://')) {
            continue
          }

          const match = line.match(/(https?:\/\/[^\s]+)/)
          if (!match) {
            continue
          }

          resolved = true
          clearTimeout(timeout)
          const url = match[1]
          logger.info('OpenCode server started', { url })
          resolve({
            url,
            close: () => {
              logger.info('Stopping opencode server')
              proc.kill()
            }
          })
          return
        }
      }

      proc.stdout?.on('data', (chunk) => {
        const text = chunk.toString()
        output += text
        logger.debug('opencode stdout', { text })
        resolveIfListening(text)
      })

      proc.stderr?.on('data', (chunk) => {
        const text = chunk.toString()
        output += text
        logger.debug('opencode stderr', { text })
        resolveIfListening(text)
      })

      proc.on('error', (error) => {
        clearTimeout(timeout)
        logger.error('Failed to spawn opencode', error)
        reject(
          new Error(
            `Unable to start opencode: ${error.message}\n` +
              'Please ensure OpenCode CLI is installed correctly.\n' +
              'Install command: curl -fsSL https://opencode.ai/install | bash'
          )
        )
      })

      proc.on('exit', (code) => {
        clearTimeout(timeout)
        if (!resolved && code !== 0 && code !== null) {
          logger.error('opencode server exited unexpectedly', { code, output })
          reject(new Error(`opencode server exited with code ${code}\nOutput: ${output}`))
        }
      })
    })
  }

  private async ensureInitialized() {
    if (this.client) {
      return
    }

    try {
      const server = await this.startOpencodeServer()
      this.server = server

      const { createOpencodeClient } = await import('@opencode-ai/sdk')
      this.client = createOpencodeClient({
        baseUrl: server.url
      })

      logger.info('OpenCode client initialized', { url: server.url })
    } catch (error) {
      logger.error('Failed to initialize OpenCode service', error as Error)
      throw error
    }
  }

  private async resolveSessionId(session: GetAgentSessionResponse, lastAgentSessionId?: string): Promise<string> {
    const preferredSessionId = lastAgentSessionId?.trim() || session.id

    try {
      await this.client.session.get({ path: { id: preferredSessionId } })
      logger.debug('Using existing opencode session', { sessionId: preferredSessionId })
      return preferredSessionId
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error
      }
    }

    logger.info('Creating new opencode session', { preferredSessionId, sessionName: session.name })
    const createdSession = await this.client.session.create({
      body: {
        title: session.name || session.id
      }
    })

    logger.info('Created opencode session', {
      requestedSessionId: preferredSessionId,
      actualSessionId: createdSession.id
    })

    return createdSession.id as string
  }

  async invoke(
    prompt: string,
    session: GetAgentSessionResponse,
    abortController: AbortController,
    lastAgentSessionId?: string,
    _thinkingOptions?: AgentThinkingOptions
  ): Promise<AgentStream> {
    const aiStream = new OpenCodeStream()

    try {
      await this.ensureInitialized()
      if (!this.client) {
        throw new Error('OpenCode client not initialized')
      }

      const modelInfo = validateModelForOpenCode(session.model)
      if (!modelInfo.valid) {
        throw new Error(`Invalid model ID: ${session.model}. ${modelInfo.error}`)
      }

      const resolvedModel = parseOpenCodeModel(session.model)

      setImmediate(() => {
        void this.processPromptStream({
          aiStream,
          prompt,
          session,
          resolvedModel,
          abortController,
          lastAgentSessionId
        })
      })
    } catch (error) {
      logger.error('Failed to invoke OpenCode', error as Error)
      setImmediate(() => {
        aiStream.emit('data', { type: 'error', error: error as Error })
      })
    }

    return aiStream
  }

  private async processPromptStream(params: {
    aiStream: OpenCodeStream
    prompt: string
    session: GetAgentSessionResponse
    resolvedModel: OpenCodeModel
    abortController: AbortController
    lastAgentSessionId?: string
  }): Promise<void> {
    const { aiStream, prompt, session, resolvedModel, abortController, lastAgentSessionId } = params
    const sessionId = await this.resolveSessionId(session, lastAgentSessionId)
    const promptMessageId = `opencode_prompt_${Date.now()}`

    const lastTextByPartId = new Map<string, string>()
    const lastReasoningByPartId = new Map<string, string>()
    const emittedToolCalls = new Set<string>()
    const emittedToolResults = new Set<string>()
    const messageRoles = new Map<string, string>()
    const queuedPartUpdates = new Map<string, QueuedPartUpdate[]>()
    let finalized = false

    const emitChunk = (chunk: Record<string, any>) => {
      aiStream.emit('data', {
        type: 'chunk',
        chunk: chunk as any
      })
    }

    const emitFinish = () => {
      emitChunk({
        type: 'finish-step',
        response: {
          id: promptMessageId,
          timestamp: new Date(),
          modelId: session.model
        },
        usage: EMPTY_USAGE,
        finishReason: 'stop',
        rawFinishReason: 'stop',
        providerMetadata: {
          raw: {
            session_id: sessionId
          }
        }
      })

      emitChunk({
        type: 'finish',
        totalUsage: EMPTY_USAGE,
        finishReason: 'stop',
        rawFinishReason: 'stop',
        providerMetadata: {
          raw: {
            session_id: sessionId
          }
        }
      })
    }

    const finalizeComplete = () => {
      if (finalized) {
        return
      }

      finalized = true
      emitFinish()
      aiStream.emit('data', { type: 'complete' })
    }

    const finalizeError = (error: unknown) => {
      if (finalized) {
        return
      }

      finalized = true
      aiStream.emit('data', {
        type: isAbortError(error) ? 'cancelled' : 'error',
        ...(isAbortError(error) ? {} : { error: error instanceof Error ? error : new Error(String(error)) })
      })
    }

    const emitTextDelta = (part: OpenCodePart, delta?: string) => {
      const nextText = part.text || ''
      const previousText = lastTextByPartId.get(part.id) || ''
      const textDelta = resolveStreamingDelta(previousText, nextText, delta)
      lastTextByPartId.set(part.id, nextText)

      if (!textDelta) {
        return
      }

      emitChunk({
        type: 'text-delta',
        id: part.id,
        text: textDelta,
        providerMetadata: {
          raw: {
            session_id: sessionId
          }
        }
      })
    }

    const emitReasoningDelta = (part: OpenCodePart, delta?: string) => {
      const nextText = part.text || ''
      const previousText = lastReasoningByPartId.get(part.id) || ''
      const reasoningDelta = resolveStreamingDelta(previousText, nextText, delta)
      lastReasoningByPartId.set(part.id, nextText)

      if (!reasoningDelta) {
        return
      }

      emitChunk({
        type: 'reasoning-delta',
        id: part.id,
        text: reasoningDelta,
        providerMetadata: {
          raw: {
            session_id: sessionId
          }
        }
      })
    }

    const emitToolUpdate = (part: OpenCodePart) => {
      const toolCallId = part.callID || part.id
      const toolName = part.tool || 'unknown'
      const toolInput = part.state?.input || {}
      const status = part.state?.status

      if ((status === 'pending' || status === 'running') && !emittedToolCalls.has(toolCallId)) {
        emittedToolCalls.add(toolCallId)
        emitChunk({
          type: 'tool-call',
          toolCallId,
          toolName,
          input: toolInput,
          providerExecuted: true,
          providerMetadata: {
            raw: {
              session_id: sessionId,
              input: toolInput
            }
          }
        })
        return
      }

      if ((status === 'completed' || status === 'error') && !emittedToolResults.has(toolCallId)) {
        emittedToolResults.add(toolCallId)
        emittedToolCalls.add(toolCallId)

        if (status === 'completed') {
          emitChunk({
            type: 'tool-result',
            toolCallId,
            toolName,
            input: toolInput,
            output: part.state?.output || '',
            providerExecuted: true,
            providerMetadata: {
              raw: {
                session_id: sessionId
              }
            }
          })
        } else {
          emitChunk({
            type: 'tool-result',
            toolCallId,
            toolName,
            input: toolInput,
            output: part.state?.error || 'Tool execution failed',
            providerExecuted: true,
            providerMetadata: {
              raw: {
                session_id: sessionId
              }
            }
          })
        }
      }
    }

    const handleAssistantPartUpdate = (part: OpenCodePart, delta?: string) => {
      switch (part.type) {
        case 'text':
          emitTextDelta(part, delta)
          break
        case 'reasoning':
          emitReasoningDelta(part, delta)
          break
        case 'tool':
          emitToolUpdate(part)
          break
        default:
          break
      }
    }

    const flushQueuedPartUpdates = (messageId: string) => {
      const queuedUpdates = queuedPartUpdates.get(messageId)
      if (!queuedUpdates) {
        return
      }

      queuedPartUpdates.delete(messageId)
      for (const queuedUpdate of queuedUpdates) {
        handleAssistantPartUpdate(queuedUpdate.part, queuedUpdate.delta)
      }
    }

    const queuePartUpdate = (part: OpenCodePart, delta?: string) => {
      const existing = queuedPartUpdates.get(part.messageID) || []
      existing.push({ part, delta })
      queuedPartUpdates.set(part.messageID, existing)
    }

    const onAbort = () => {
      if (!this.client) {
        return
      }

      void this.client.session.abort({ path: { id: sessionId } }).catch((error: Error) => {
        logger.warn('Failed to abort OpenCode session', {
          sessionId,
          error: error.message
        })
      })
    }

    if (abortController.signal.aborted) {
      onAbort()
      aiStream.emit('data', { type: 'cancelled' })
      return
    }

    abortController.signal.addEventListener('abort', onAbort, { once: true })

    try {
      const eventResult = await this.client.event.subscribe({
        signal: abortController.signal
      })

      emitChunk({
        type: 'raw',
        rawValue: {
          type: 'init',
          session_id: sessionId
        }
      })

      await this.client.session.promptAsync({
        path: { id: sessionId },
        body: {
          messageID: promptMessageId,
          model: resolvedModel,
          system: session.instructions || undefined,
          parts: [
            {
              type: 'text',
              text: prompt
            }
          ]
        },
        signal: abortController.signal
      })

      for await (const event of eventResult.stream as AsyncIterable<OpenCodeEvent>) {
        if (finalized) {
          break
        }

        switch (event.type) {
          case 'message.updated': {
            const messageInfo = event.properties?.info as OpenCodeMessageInfo | undefined
            if (!messageInfo || messageInfo.sessionID !== sessionId) {
              break
            }

            messageRoles.set(messageInfo.id, messageInfo.role || '')

            if (messageInfo.role === 'assistant') {
              flushQueuedPartUpdates(messageInfo.id)
            } else {
              queuedPartUpdates.delete(messageInfo.id)
            }

            if (messageInfo.error?.data?.message) {
              throw new Error(messageInfo.error.data.message)
            }
            break
          }

          case 'message.part.updated': {
            const part = event.properties?.part as OpenCodePart | undefined
            if (!part || part.sessionID !== sessionId) {
              break
            }

            if (part.messageID === promptMessageId) {
              break
            }

            const role = messageRoles.get(part.messageID)
            if (role === 'assistant') {
              handleAssistantPartUpdate(part, event.properties?.delta)
            } else if (role === undefined && part.type !== 'text') {
              handleAssistantPartUpdate(part, event.properties?.delta)
            } else if (role === undefined) {
              queuePartUpdate(part, event.properties?.delta)
            }
            break
          }

          case 'message.part.removed': {
            const removedSessionId = event.properties?.sessionID as string | undefined
            const removedPartId = event.properties?.partID as string | undefined
            if (removedSessionId !== sessionId || !removedPartId) {
              break
            }

            lastTextByPartId.delete(removedPartId)
            lastReasoningByPartId.delete(removedPartId)
            break
          }

          case 'session.error': {
            const errorSessionId = event.properties?.sessionID as string | undefined
            if (errorSessionId && errorSessionId !== sessionId) {
              break
            }

            const message = event.properties?.error?.data?.message || 'OpenCode session failed'
            throw new Error(message)
          }

          case 'session.idle': {
            if (event.properties?.sessionID !== sessionId) {
              break
            }

            finalizeComplete()
            break
          }

          default:
            break
        }
      }

      if (!finalized && !abortController.signal.aborted) {
        logger.warn('OpenCode event stream ended before session.idle; completing defensively', { sessionId })
        finalizeComplete()
      }
    } catch (error) {
      if (isAbortError(error) || abortController.signal.aborted) {
        finalizeError(new Error('Request aborted'))
      } else {
        logger.error('Error processing OpenCode stream', error as Error)
        finalizeError(error)
      }
    } finally {
      abortController.signal.removeEventListener('abort', onAbort)
    }
  }

  dispose() {
    if (this.server) {
      this.server.close()
      this.server = null
      this.client = null
    }
  }
}

export default OpenCodeService
