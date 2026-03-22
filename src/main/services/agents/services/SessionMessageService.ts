import { randomUUID } from 'node:crypto'

import { loggerService } from '@logger'
import type {
  AgentPersistedMessage,
  AgentSessionMessageEntity,
  CreateSessionMessageRequest,
  GetAgentSessionResponse,
  ListOptions,
  Message
} from '@types'
import type { TextStreamPart } from 'ai'
import { and, desc, eq, not } from 'drizzle-orm'

import { BaseService } from '../BaseService'
import { agentMessageRepository } from '../database'
import { sessionMessagesTable } from '../database/schema'
import type { AgentStreamEvent } from '../interfaces/AgentStreamInterface'
import { resolveAgentRuntime } from './AgentRuntimeResolver'

const logger = loggerService.withContext('SessionMessageService')
const AGENT_SESSION_TOPIC_PREFIX = 'agent-session:'

type SessionStreamResult = {
  stream: ReadableStream<TextStreamPart<Record<string, any>>>
  completion: Promise<{
    userMessage?: AgentSessionMessageEntity
    assistantMessage?: AgentSessionMessageEntity
  }>
}

// Ensure errors emitted through SSE are serializable
function serializeError(error: unknown): { message: string; name?: string; stack?: string } {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack
    }
  }

  if (typeof error === 'string') {
    return { message: error }
  }

  return {
    message: 'Unknown error'
  }
}

function toSerializedError(error: unknown) {
  const serialized = serializeError(error)
  return {
    name: serialized.name ?? null,
    message: serialized.message ?? null,
    stack: serialized.stack ?? null
  }
}

function normalizeBlockContent(content: unknown): string | object | undefined {
  if (content === undefined) {
    return undefined
  }

  if (typeof content === 'string') {
    return content
  }

  if (content && typeof content === 'object') {
    return content as object
  }

  return JSON.stringify(content)
}

class TextStreamAccumulator {
  private textBuffer = ''
  private totalText = ''
  private readonly toolCalls = new Map<string, { toolName?: string; input?: unknown }>()
  private readonly toolResults = new Map<string, unknown>()
  private agentSessionId = ''

  private captureAgentSessionId(part: TextStreamPart<Record<string, any>>): void {
    const providerMetadata = (part as TextStreamPart<Record<string, any>> & { providerMetadata?: Record<string, any> })
      .providerMetadata
    const rawValue = (part as TextStreamPart<Record<string, any>> & { rawValue?: Record<string, any> }).rawValue

    const candidate =
      providerMetadata?.anthropic?.session_id ?? providerMetadata?.raw?.session_id ?? rawValue?.session_id ?? ''

    if (typeof candidate === 'string' && candidate.trim()) {
      this.agentSessionId = candidate.trim()
    }
  }

  add(part: TextStreamPart<Record<string, any>>): void {
    this.captureAgentSessionId(part)

    switch (part.type) {
      case 'text-start':
        this.textBuffer = ''
        break
      case 'text-delta':
        if (part.text) {
          this.textBuffer += part.text
          this.totalText += part.text
        }
        break
      case 'text-end': {
        const providerTextValue = (
          part as TextStreamPart<Record<string, any>> & {
            providerMetadata?: { text?: { value?: string } }
          }
        ).providerMetadata?.text?.value
        const blockText = !this.textBuffer && typeof providerTextValue === 'string' ? providerTextValue : ''
        if (blockText) {
          this.totalText += blockText
        }
        this.textBuffer = ''
        break
      }
      case 'tool-call':
        if (part.toolCallId) {
          const legacyPart = part as typeof part & {
            args?: unknown
            providerMetadata?: { raw?: { input?: unknown } }
          }
          this.toolCalls.set(part.toolCallId, {
            toolName: part.toolName,
            input: part.input ?? legacyPart.args ?? legacyPart.providerMetadata?.raw?.input
          })
        }
        break
      case 'tool-result':
        if (part.toolCallId) {
          const legacyPart = part as typeof part & {
            result?: unknown
            providerMetadata?: { raw?: unknown }
          }
          this.toolResults.set(part.toolCallId, part.output ?? legacyPart.result ?? legacyPart.providerMetadata?.raw)
        }
        break
      default:
        break
    }
  }

  getText(): string {
    return this.totalText
  }

  getAgentSessionId(): string {
    return this.agentSessionId
  }

  hasContent(): boolean {
    return Boolean(this.totalText || this.toolCalls.size || this.toolResults.size)
  }

  buildToolBlocks(
    messageId: string,
    createdAt: string,
    status: 'success' | 'paused' | 'error'
  ): AgentPersistedMessage['blocks'] {
    const blocks: AgentPersistedMessage['blocks'] = []

    for (const [toolId, toolCall] of this.toolCalls.entries()) {
      const toolResult = this.toolResults.get(toolId)
      const blockStatus = toolResult !== undefined ? 'success' : status === 'error' ? 'error' : status

      blocks.push({
        id: randomUUID(),
        messageId,
        type: 'tool' as AgentPersistedMessage['blocks'][number]['type'],
        createdAt,
        updatedAt: createdAt,
        status: blockStatus as AgentPersistedMessage['blocks'][number]['status'],
        toolId,
        toolName: toolCall.toolName,
        arguments:
          toolCall.input && typeof toolCall.input === 'object' && !Array.isArray(toolCall.input)
            ? (toolCall.input as Record<string, any>)
            : undefined,
        content: normalizeBlockContent(toolResult),
        ...(status === 'error' && toolResult === undefined
          ? {
              error: toSerializedError(new Error('Tool execution did not finish successfully'))
            }
          : {})
      } as AgentPersistedMessage['blocks'][number])
    }

    return blocks
  }
}

export class SessionMessageService extends BaseService {
  private static instance: SessionMessageService | null = null

  static getInstance(): SessionMessageService {
    if (!SessionMessageService.instance) {
      SessionMessageService.instance = new SessionMessageService()
    }
    return SessionMessageService.instance
  }

  async sessionMessageExists(id: number): Promise<boolean> {
    const database = await this.getDatabase()
    const result = await database
      .select({ id: sessionMessagesTable.id })
      .from(sessionMessagesTable)
      .where(eq(sessionMessagesTable.id, id))
      .limit(1)

    return result.length > 0
  }

  async listSessionMessages(
    sessionId: string,
    options: ListOptions = {}
  ): Promise<{ messages: AgentSessionMessageEntity[] }> {
    // Get messages with pagination
    const database = await this.getDatabase()
    const baseQuery = database
      .select()
      .from(sessionMessagesTable)
      .where(eq(sessionMessagesTable.session_id, sessionId))
      .orderBy(sessionMessagesTable.created_at)

    const result =
      options.limit !== undefined
        ? options.offset !== undefined
          ? await baseQuery.limit(options.limit).offset(options.offset)
          : await baseQuery.limit(options.limit)
        : await baseQuery

    const messages = result.map((row) => this.deserializeSessionMessage(row)) as AgentSessionMessageEntity[]

    return { messages }
  }

  async deleteSessionMessage(sessionId: string, messageId: number): Promise<boolean> {
    const database = await this.getDatabase()
    const result = await database
      .delete(sessionMessagesTable)
      .where(and(eq(sessionMessagesTable.id, messageId), eq(sessionMessagesTable.session_id, sessionId)))

    return result.rowsAffected > 0
  }

  async createSessionMessage(
    session: GetAgentSessionResponse,
    messageData: CreateSessionMessageRequest,
    abortController: AbortController
  ): Promise<SessionStreamResult> {
    return await this.startSessionMessageStream(session, messageData, abortController)
  }

  private async startSessionMessageStream(
    session: GetAgentSessionResponse,
    req: CreateSessionMessageRequest,
    abortController: AbortController
  ): Promise<SessionStreamResult> {
    const lastAgentSessionId = await this.getLastAgentSessionId(session.id)
    logger.debug('Session Message stream message data:', { message: req, session_id: lastAgentSessionId })

    const userMessagePayload = this.buildUserMessagePayload(session, req.content, req.userMessageId)
    const userMessage = await agentMessageRepository.persistUserMessage({
      sessionId: session.id,
      agentSessionId: lastAgentSessionId,
      payload: userMessagePayload
    })
    const accumulator = new TextStreamAccumulator()
    const agentService = await resolveAgentRuntime(session)

    let agentStream
    try {
      agentStream = await agentService.invoke(req.content, session, abortController, lastAgentSessionId, {
        effort: req.effort,
        thinking: req.thinking
      })
    } catch (invokeError) {
      const assistantPayload = this.buildAssistantMessagePayload(
        session,
        userMessagePayload.message.id,
        accumulator,
        req.assistantMessageId,
        lastAgentSessionId || session.id,
        'error',
        invokeError
      )

      if (assistantPayload) {
        await agentMessageRepository.persistAssistantMessage({
          sessionId: session.id,
          agentSessionId: lastAgentSessionId || session.id,
          payload: assistantPayload
        })
      }

      throw invokeError
    }

    let resolveCompletion!: (value: {
      userMessage?: AgentSessionMessageEntity
      assistantMessage?: AgentSessionMessageEntity
    }) => void
    let rejectCompletion!: (reason?: unknown) => void

    const completion = new Promise<{
      userMessage?: AgentSessionMessageEntity
      assistantMessage?: AgentSessionMessageEntity
    }>((resolve, reject) => {
      resolveCompletion = resolve
      rejectCompletion = reject
    })

    let streamClosed = false
    let completionSettled = false

    const cleanup = () => {
      agentStream.removeAllListeners()
    }

    const finalizeCompletion = async (status: 'success' | 'paused' | 'error', error?: unknown): Promise<void> => {
      if (completionSettled) {
        return
      }

      completionSettled = true
      cleanup()

      try {
        const agentSessionIdToPersist = accumulator.getAgentSessionId() || lastAgentSessionId || session.id
        const assistantPayload = this.buildAssistantMessagePayload(
          session,
          userMessagePayload.message.id,
          accumulator,
          req.assistantMessageId,
          agentSessionIdToPersist,
          status,
          error
        )

        const assistantMessage = assistantPayload
          ? await agentMessageRepository.persistAssistantMessage({
              sessionId: session.id,
              agentSessionId: agentSessionIdToPersist,
              payload: assistantPayload
            })
          : undefined

        if (status === 'error') {
          rejectCompletion(serializeError(error))
          return
        }

        resolveCompletion({
          userMessage,
          assistantMessage
        })
      } catch (persistError) {
        logger.error('Failed to persist agent session exchange', {
          sessionId: session.id,
          error: persistError
        })
        rejectCompletion(serializeError(persistError))
      }
    }

    const stream = new ReadableStream<TextStreamPart<Record<string, any>>>({
      start: (controller) => {
        agentStream.on('data', async (event: AgentStreamEvent) => {
          if (streamClosed) return
          try {
            switch (event.type) {
              case 'chunk': {
                const chunk = event.chunk as TextStreamPart<Record<string, any>> | undefined
                if (!chunk) {
                  logger.warn('Received agent chunk event without chunk payload')
                  return
                }

                accumulator.add(chunk)
                controller.enqueue(chunk)
                break
              }

              case 'error': {
                const stderrMessage = (event as any)?.data?.stderr as string | undefined
                const underlyingError = event.error ?? (stderrMessage ? new Error(stderrMessage) : undefined)
                const streamError = underlyingError ?? new Error('Stream error')
                streamClosed = true
                controller.error(streamError)
                await finalizeCompletion('error', streamError)
                break
              }

              case 'complete': {
                streamClosed = true
                controller.close()
                await finalizeCompletion('success')
                break
              }

              case 'cancelled': {
                streamClosed = true
                controller.close()
                await finalizeCompletion('paused')
                break
              }

              default:
                logger.warn('Unknown event type from agent runtime:', {
                  type: event.type
                })
                break
            }
          } catch (error) {
            streamClosed = true
            controller.error(error)
            await finalizeCompletion('error', error)
          }
        })
      },
      cancel: (reason) => {
        streamClosed = true
        abortController.abort(typeof reason === 'string' ? reason : 'stream cancelled')
        void finalizeCompletion('paused')
      }
    })

    return { stream, completion }
  }

  private async getLastAgentSessionId(sessionId: string): Promise<string> {
    try {
      const database = await this.getDatabase()
      const result = await database
        .select({ agent_session_id: sessionMessagesTable.agent_session_id })
        .from(sessionMessagesTable)
        .where(and(eq(sessionMessagesTable.session_id, sessionId), not(eq(sessionMessagesTable.agent_session_id, ''))))
        .orderBy(desc(sessionMessagesTable.created_at))
        .limit(1)

      logger.silly('Last agent session ID result:', { agentSessionId: result[0]?.agent_session_id, sessionId })
      return result[0]?.agent_session_id || ''
    } catch (error) {
      logger.error('Failed to get last agent session ID', {
        sessionId,
        error
      })
      return ''
    }
  }

  private deserializeSessionMessage(data: any): AgentSessionMessageEntity {
    if (!data) return data

    const deserialized = { ...data }

    // Parse content JSON
    if (deserialized.content && typeof deserialized.content === 'string') {
      try {
        deserialized.content = JSON.parse(deserialized.content)
      } catch (error) {
        logger.warn(`Failed to parse content JSON:`, error as Error)
      }
    }

    // Parse metadata JSON
    if (deserialized.metadata && typeof deserialized.metadata === 'string') {
      try {
        deserialized.metadata = JSON.parse(deserialized.metadata)
      } catch (error) {
        logger.warn(`Failed to parse metadata JSON:`, error as Error)
      }
    }

    if (deserialized.metadata === null) {
      deserialized.metadata = undefined
    }

    return deserialized
  }

  private buildUserMessagePayload(
    session: GetAgentSessionResponse,
    content: string,
    messageId: string = randomUUID()
  ): AgentPersistedMessage {
    const createdAt = new Date().toISOString()
    const blockId = randomUUID()
    const topicId = this.buildTopicId(session.id)

    return {
      message: {
        id: messageId,
        role: 'user',
        assistantId: session.agent_id,
        topicId,
        createdAt,
        status: 'success' as Message['status'],
        blocks: [blockId]
      } satisfies Message,
      blocks: [
        {
          id: blockId,
          messageId,
          type: 'main_text' as AgentPersistedMessage['blocks'][number]['type'],
          createdAt,
          updatedAt: createdAt,
          status: 'success' as AgentPersistedMessage['blocks'][number]['status'],
          content
        } as AgentPersistedMessage['blocks'][number]
      ]
    }
  }

  private buildAssistantMessagePayload(
    session: GetAgentSessionResponse,
    askId: string,
    accumulator: TextStreamAccumulator,
    messageId: string | undefined,
    agentSessionId: string,
    status: 'success' | 'paused' | 'error',
    error?: unknown
  ): AgentPersistedMessage | undefined {
    if (!accumulator.hasContent() && !error) {
      return undefined
    }

    const createdAt = new Date().toISOString()
    const persistedMessageId = messageId ?? randomUUID()
    const topicId = this.buildTopicId(session.id)
    const blocks: AgentPersistedMessage['blocks'] = []
    const text = accumulator.getText()

    if (text) {
      const mainTextBlockId = randomUUID()
      blocks.push({
        id: mainTextBlockId,
        messageId: persistedMessageId,
        type: 'main_text' as AgentPersistedMessage['blocks'][number]['type'],
        createdAt,
        updatedAt: createdAt,
        status: (status === 'error' ? 'error' : status) as AgentPersistedMessage['blocks'][number]['status'],
        content: text
      } as AgentPersistedMessage['blocks'][number])
    }

    blocks.push(...accumulator.buildToolBlocks(persistedMessageId, createdAt, status))

    if (error) {
      blocks.push({
        id: randomUUID(),
        messageId: persistedMessageId,
        type: 'error' as AgentPersistedMessage['blocks'][number]['type'],
        createdAt,
        updatedAt: createdAt,
        status: 'error' as AgentPersistedMessage['blocks'][number]['status'],
        error: toSerializedError(error)
      } as AgentPersistedMessage['blocks'][number])
    }

    return {
      message: {
        id: persistedMessageId,
        role: 'assistant',
        assistantId: session.agent_id,
        topicId,
        createdAt,
        status: status as Message['status'],
        askId,
        modelId: session.model,
        blocks: blocks.map((block) => block.id),
        agentSessionId
      } satisfies Message,
      blocks
    }
  }

  private buildTopicId(sessionId: string): string {
    return `${AGENT_SESSION_TOPIC_PREFIX}${sessionId}`
  }
}

export const sessionMessageService = SessionMessageService.getInstance()
