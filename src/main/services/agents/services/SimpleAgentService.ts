import { loggerService } from '@logger'
import type { GetAgentSessionResponse } from '@types'
import { EventEmitter } from 'events'

import type { AgentServiceInterface, AgentStream, AgentStreamEvent } from '../interfaces/AgentStreamInterface'

const logger = loggerService.withContext('SimpleAgentService')

class SimpleAgentStream extends EventEmitter implements AgentStream {
  declare emit: (event: 'data', data: AgentStreamEvent) => boolean
  declare on: (event: 'data', listener: (data: AgentStreamEvent) => void) => this
  declare once: (event: 'data', listener: (data: AgentStreamEvent) => void) => this
}

/**
 * 简化的 Agent 服务
 * 直接使用主进程的 AI 能力，不依赖外部 OpenCode 服务
 */
export class SimpleAgentService implements AgentServiceInterface {
  private static instance: SimpleAgentService | null = null

  static getInstance(): SimpleAgentService {
    if (!SimpleAgentService.instance) {
      SimpleAgentService.instance = new SimpleAgentService()
    }
    return SimpleAgentService.instance
  }

  /**
   * 调用 Agent 进行对话
   * 通过 IPC 调用渲染进程的 AI 能力
   */
  async invoke(
    prompt: string,
    session: GetAgentSessionResponse,
    abortController: AbortController
  ): Promise<AgentStream> {
    const aiStream = new SimpleAgentStream()

    try {
      logger.info('Starting simple agent invocation', {
        sessionId: session.id,
        model: session.model,
        promptLength: prompt.length
      })

      // 通过 IPC 调用主进程的 AI 服务
      const { ipcMain } = require('electron')
      const { v4: uuidv4 } = require('uuid')
      const requestId = uuidv4()

      // 发送 AI 请求到主进程处理
      const result = await ipcMain.emit('agent:stream', {
        requestId,
        prompt,
        session,
        signal: abortController.signal
      })

      // 处理流式响应
      this.handleStreamResponse(result, aiStream, abortController)
    } catch (error) {
      logger.error('Failed to invoke simple agent', error as Error)
      aiStream.emit('data', {
        type: 'error',
        error: error instanceof Error ? error : new Error(String(error))
      })
    }

    return aiStream
  }

  private handleStreamResponse(result: any, aiStream: SimpleAgentStream, abortController: AbortController): void {
    const messageId = `simple_${Date.now()}`

    // 模拟流式响应
    setImmediate(async () => {
      try {
        if (result && result.text) {
          // 分块发送文本，模拟流式效果
          const text = result.text
          const chunkSize = 10

          for (let i = 0; i < text.length; i += chunkSize) {
            if (abortController.signal.aborted) {
              aiStream.emit('data', { type: 'cancelled' })
              return
            }

            const chunk = text.slice(i, i + chunkSize)
            aiStream.emit('data', {
              type: 'chunk',
              chunk: {
                type: 'text-delta',
                id: messageId,
                text: chunk
              }
            })

            // 小延迟模拟打字效果
            await new Promise((resolve) => setTimeout(resolve, 50))
          }

          aiStream.emit('data', { type: 'complete' })
        } else {
          throw new Error('Invalid response from AI service')
        }
      } catch (error) {
        logger.error('Error handling stream response', error as Error)
        aiStream.emit('data', {
          type: 'error',
          error: error instanceof Error ? error : new Error(String(error))
        })
      }
    })
  }

  dispose(): void {
    // 清理资源
    logger.info('SimpleAgentService disposed')
  }
}

export default SimpleAgentService
