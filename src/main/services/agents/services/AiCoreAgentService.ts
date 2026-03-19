import { loggerService } from '@logger'
import type { GetAgentSessionResponse } from '@types'
import { EventEmitter } from 'events'

import type {
  AgentServiceInterface,
  AgentStream,
  AgentStreamEvent,
  AgentThinkingOptions
} from '../interfaces/AgentStreamInterface'

const logger = loggerService.withContext('AiCoreAgentService')

class AiCoreAgentStream extends EventEmitter implements AgentStream {
  declare emit: (event: 'data', data: AgentStreamEvent) => boolean
  declare on: (event: 'data', listener: (data: AgentStreamEvent) => void) => this
  declare once: (event: 'data', listener: (data: AgentStreamEvent) => void) => this
}

/**
 * 基于 AI Core 的 Agent 服务
 * 直接使用项目内置的 AI 能力，不依赖外部 OpenCode 服务
 */
export class AiCoreAgentService implements AgentServiceInterface {
  private static instance: AiCoreAgentService | null = null

  static getInstance(): AiCoreAgentService {
    if (!AiCoreAgentService.instance) {
      AiCoreAgentService.instance = new AiCoreAgentService()
    }
    return AiCoreAgentService.instance
  }

  /**
   * 调用 Agent 进行对话
   */
  async invoke(
    prompt: string,
    session: GetAgentSessionResponse,
    abortController: AbortController,
    _lastAgentSessionId?: string,
    _thinkingOptions?: AgentThinkingOptions
  ): Promise<AgentStream> {
    const aiStream = new AiCoreAgentStream()

    try {
      logger.info('Starting AI Core agent invocation', {
        sessionId: session.id,
        model: session.model,
        promptLength: prompt.length
      })

      // 动态导入 AI Core
      const { OpenAI } = await import('@cherrystudio/ai-core')
      const { validateModelId } = await import('@main/apiServer/utils')

      // 验证模型
      const modelValidation = await validateModelId(session.model)
      if (!modelValidation.valid) {
        throw new Error(`模型验证失败: ${modelValidation.error?.message || '未知错误'}`)
      }

      const provider = modelValidation.provider!
      const modelId = modelValidation.modelId!

      // 创建 OpenAI 客户端
      const client = new OpenAI({
        baseURL: provider.apiHost,
        apiKey: provider.apiKey
      })

      // 构建消息历史
      const messages = await this.buildMessageHistory(session.id, prompt)

      // 开始流式对话
      this.streamChat(client, modelId, messages, session, aiStream, abortController)
    } catch (error) {
      logger.error('Failed to invoke AI Core agent', error as Error)
      aiStream.emit('data', {
        type: 'error',
        error: error instanceof Error ? error : new Error(String(error))
      })
    }

    return aiStream
  }

  /**
   * 构建消息历史
   */
  private async buildMessageHistory(sessionId: string, currentPrompt: string): Promise<any[]> {
    // 获取历史消息
    const { sessionMessageService } = await import('../index')
    const { messages } = await sessionMessageService.listSessionMessages(sessionId, { limit: 20 })

    const historyMessages = messages.map((msg) => ({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
    }))

    // 添加当前消息
    historyMessages.push({
      role: 'user',
      content: currentPrompt
    })

    return historyMessages
  }

  /**
   * 执行流式对话
   */
  private async streamChat(
    client: any,
    modelId: string,
    messages: any[],
    session: GetAgentSessionResponse,
    aiStream: AiCoreAgentStream,
    abortController: AbortController
  ): Promise<void> {
    const messageId = `aicore_${Date.now()}`

    try {
      logger.debug('Starting stream chat', { modelId, messageCount: messages.length })

      const stream = await client.chat.completions.create({
        model: modelId,
        messages,
        stream: true,
        temperature: session.configuration?.temperature ?? 0.7,
        max_tokens: session.configuration?.max_tokens
      })

      for await (const chunk of stream) {
        if (abortController.signal.aborted) {
          aiStream.emit('data', { type: 'cancelled' })
          return
        }

        const content = chunk.choices?.[0]?.delta?.content
        if (content) {
          aiStream.emit('data', {
            type: 'chunk',
            chunk: {
              type: 'text-delta',
              id: messageId,
              text: content
            }
          })
        }
      }

      aiStream.emit('data', { type: 'complete' })
      logger.info('Stream chat completed', { sessionId: session.id })
    } catch (error) {
      logger.error('Error in stream chat', error as Error)
      aiStream.emit('data', {
        type: 'error',
        error: error instanceof Error ? error : new Error(String(error))
      })
    }
  }

  dispose(): void {
    logger.info('AiCoreAgentService disposed')
  }
}

export default AiCoreAgentService
