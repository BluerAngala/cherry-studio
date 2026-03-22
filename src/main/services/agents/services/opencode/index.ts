// src/main/services/agents/services/opencode/index.ts
import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
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

/**
 * 简单的模型验证 - 只检查格式，不检查是否在列表中
 * OpenCode 支持任何模型，只要 provider 存在即可
 */
function validateModelForOpenCode(model: string): { valid: boolean; error?: string } {
  if (!model || typeof model !== 'string') {
    return { valid: false, error: 'Model must be a non-empty string' }
  }

  if (!model.includes(':')) {
    return { valid: false, error: "Invalid model format. Expected: 'provider:model_id'" }
  }

  const parts = model.split(':')
  if (parts.length < 2 || !parts[0] || !parts[1]) {
    return { valid: false, error: 'Invalid model format' }
  }

  return { valid: true }
}

/**
 * 查找 opencode 可执行文件路径
 * 优先使用项目内嵌的 opencode-ai 包
 */
function findOpencodePath(): { command: string; args: string[] } | null {
  const fs = require('node:fs')
  const { execSync } = require('node:child_process')

  try {
    const result = execSync('where opencode 2>nul || which opencode 2>/dev/null', { encoding: 'utf-8' }).trim()
    if (result) {
      logger.info('Found system opencode in PATH')
      return { command: 'opencode', args: [] }
    }
  } catch {
    // Ignore and continue searching bundled locations
  }

  // 0. 首先尝试使用包装脚本（解决平台包名不匹配问题）
  const appRoot = process.cwd()
  const wrapperPaths = [
    path.join(appRoot, 'scripts', 'opencode-wrapper.js'),
    path.join(appRoot, '..', 'scripts', 'opencode-wrapper.js'),
    path.join(process.resourcesPath || '', 'scripts', 'opencode-wrapper.js')
  ]

  for (const wrapperPath of wrapperPaths) {
    try {
      if (fs.existsSync(wrapperPath)) {
        logger.info('Found opencode wrapper script at:', { path: wrapperPath })
        return { command: 'node', args: [wrapperPath] }
      }
    } catch {
      // 继续搜索
    }
  }

  // 1. 查找 Windows 平台的直接二进制文件
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
    try {
      if (fs.existsSync(binaryPath)) {
        logger.info('Found Windows opencode binary at:', { path: binaryPath })
        return { command: binaryPath, args: [] }
      }
    } catch {
      // 继续搜索
    }
  }

  // 2. 尝试使用系统 PATH 中的 opencode（用户自己安装的）
  try {
    const { execSync } = require('node:child_process')
    const result = execSync('where opencode 2>nul || which opencode 2>/dev/null', { encoding: 'utf-8' }).trim()
    if (result) {
      logger.info('Found system opencode in PATH')
      return { command: 'opencode', args: [] }
    }
  } catch {
    // 忽略错误，继续搜索
  }

  // 3. 搜索常见全局安装路径
  const globalPaths = [
    path.join(os.homedir(), '.opencode', 'bin', 'opencode.exe'),
    path.join(os.homedir(), '.opencode', 'bin', 'opencode'),
    path.join(os.homedir(), 'AppData', 'Roaming', 'npm', 'opencode.cmd'),
    path.join(os.homedir(), 'AppData', 'Roaming', 'npm', 'opencode'),
    'C:\\Program Files\\nodejs\\opencode.cmd',
    'C:\\Program Files\\nodejs\\opencode'
  ]

  for (const opencodePath of globalPaths) {
    try {
      if (fs.existsSync(opencodePath)) {
        logger.info('Found global opencode at:', { path: opencodePath })
        return { command: opencodePath, args: [] }
      }
    } catch {
      // 继续搜索
    }
  }

  logger.error('Could not find opencode executable in any location')
  return null
}

class OpenCodeStream extends EventEmitter implements AgentStream {
  declare emit: (event: 'data', data: AgentStreamEvent) => boolean
  declare on: (event: 'data', listener: (data: AgentStreamEvent) => void) => this
  declare once: (event: 'data', listener: (data: AgentStreamEvent) => void) => this
}

export class OpenCodeService implements AgentServiceInterface {
  private client: any | null = null
  private server: { url: string; close: () => void } | null = null

  /**
   * 手动启动 opencode 服务器
   * 使用自定义逻辑来确保能找到 opencode 可执行文件
   */
  private async startOpencodeServer(): Promise<{ url: string; close: () => void }> {
    const opencodeConfig = findOpencodePath()

    if (!opencodeConfig) {
      throw new Error(
        'OpenCode CLI 未找到。请确保已安装 OpenCode CLI 并添加到 PATH 中。\n' +
          '安装命令: curl -fsSL https://opencode.ai/install | bash'
      )
    }

    const hostname = '127.0.0.1'
    const port = 0 // 自动选择端口

    // 使用查找结果中的命令和参数
    const { command, args: baseArgs } = opencodeConfig
    const args = [...baseArgs, 'serve', `--hostname=${hostname}`, `--port=${port}`]

    logger.info('Starting opencode server with:', { command, args })

    return new Promise((resolve, reject) => {
      const proc = spawn(command, args, {
        env: {
          ...process.env,
          PATH: process.env.PATH || ''
        }
      })

      const timeout = setTimeout(() => {
        proc.kill()
        reject(new Error('Timeout waiting for opencode server to start'))
      }, 10000)

      let output = ''

      proc.stdout?.on('data', (chunk) => {
        const text = chunk.toString()
        output += text
        logger.debug('opencode stdout:', text)

        // 解析服务器 URL
        const lines = text.split('\n')
        for (const line of lines) {
          if (line.includes('listening') || line.includes('http://')) {
            const match = line.match(/(https?:\/\/[^\s]+)/)
            if (match) {
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
        }
      })

      proc.stderr?.on('data', (chunk) => {
        const text = chunk.toString()
        output += text
        logger.debug('opencode stderr:', text)
      })

      proc.on('error', (error) => {
        clearTimeout(timeout)
        logger.error('Failed to spawn opencode:', error)
        reject(
          new Error(
            `无法启动 opencode: ${error.message}\n` +
              `请确保 OpenCode CLI 已正确安装。\n` +
              `安装命令: curl -fsSL https://opencode.ai/install | bash`
          )
        )
      })

      proc.on('exit', (code) => {
        clearTimeout(timeout)
        if (code !== 0 && code !== null) {
          logger.error('opencode server exited with code:', { code, output })
          reject(
            new Error(
              `opencode server exited with code ${code}\nOutput: ${output}\n` + `请检查 OpenCode CLI 是否正确安装。`
            )
          )
        }
      })
    })
  }

  private async ensureInitialized() {
    if (this.client) return

    try {
      // 手动启动 opencode 服务器
      const server = await this.startOpencodeServer()
      this.server = server

      // 创建客户端
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

  async invoke(
    prompt: string,
    session: GetAgentSessionResponse,
    abortController: AbortController,
    _lastAgentSessionId?: string,
    _thinkingOptions?: AgentThinkingOptions
  ): Promise<AgentStream> {
    const aiStream = new OpenCodeStream()

    try {
      await this.ensureInitialized()
      if (!this.client) throw new Error('OpenCode client not initialized')

      const modelInfo = validateModelForOpenCode(session.model)
      if (!modelInfo.valid) {
        throw new Error(`Invalid model ID: ${session.model}. ${modelInfo.error}`)
      }

      // 1. Ensure opencode session exists or create one
      const opencodeSessionId = session.id
      try {
        // 尝试获取 session，如果不存在则创建
        await this.client.session.get({ path: { id: opencodeSessionId } })
        logger.debug('Using existing opencode session', { sessionId: opencodeSessionId })
      } catch (error: any) {
        // Session 不存在，创建新的
        if (error?.statusCode === 404 || error?.message?.includes('not found')) {
          logger.info('Creating new opencode session', { sessionId: opencodeSessionId })
          await this.client.session.create({
            body: {
              id: opencodeSessionId,
              model: session.model,
              instructions: session.instructions || 'You are a helpful assistant.',
              config: session.configuration || {}
            }
          })
        } else {
          throw error
        }
      }

      // 2. Call prompt with SSE
      const sseResult = await (this.client.session.prompt as any).sse({
        path: { id: opencodeSessionId },
        body: {
          parts: [{ type: 'text', text: prompt }],
          config: {
            model: session.model,
            instructions: session.instructions
          }
        },
        signal: abortController.signal
      })

      // 3. Process the stream
      const processStream = async () => {
        try {
          const messageId = `opencode_${Date.now()}`
          logger.debug('Starting to process OpenCode stream', { messageId, sessionId: opencodeSessionId })

          for await (const event of sseResult.stream) {
            logger.debug('Received OpenCode event', { type: event.type, event })

            // Map OpenCode events to AgentStreamEvent
            if (event.type === 'text') {
              aiStream.emit('data', {
                type: 'chunk',
                chunk: {
                  type: 'text-delta',
                  id: messageId,
                  text: event.text
                }
              })
            } else if (event.type === 'tool_use') {
              aiStream.emit('data', {
                type: 'chunk',
                chunk: {
                  type: 'tool-call',
                  toolCallId: event.id,
                  toolName: event.name,
                  input: event.input
                }
              })
            } else if (event.type === 'tool_result') {
              aiStream.emit('data', {
                type: 'chunk',
                chunk: {
                  type: 'tool-result',
                  toolCallId: event.tool_use_id,
                  toolName: '', // Optional
                  input: {}, // Required by some versions of AI SDK
                  output: event.content
                }
              })
            }
          }
          aiStream.emit('data', { type: 'complete' })
        } catch (error) {
          if ((error as any).name === 'AbortError') {
            aiStream.emit('data', { type: 'cancelled' })
          } else {
            logger.error('Error processing OpenCode stream', error as Error)
            aiStream.emit('data', { type: 'error', error: error as Error })
          }
        }
      }

      processStream()
    } catch (error) {
      logger.error('Failed to invoke OpenCode', error as Error)
      setImmediate(() => {
        aiStream.emit('data', { type: 'error', error: error as Error })
      })
    }

    return aiStream
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
