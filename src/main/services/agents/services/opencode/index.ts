// src/main/services/agents/services/opencode/index.ts
import { EventEmitter } from 'node:events'

import { loggerService } from '@logger'
import { validateModelId } from '@main/apiServer/utils'
import type { GetAgentSessionResponse } from '@types'

import type {
  AgentServiceInterface,
  AgentStream,
  AgentStreamEvent,
  AgentThinkingOptions
} from '../../interfaces/AgentStreamInterface'

const logger = loggerService.withContext('OpenCodeService')

class OpenCodeStream extends EventEmitter implements AgentStream {
  declare emit: (event: 'data', data: AgentStreamEvent) => boolean
  declare on: (event: 'data', listener: (data: AgentStreamEvent) => void) => this
  declare once: (event: 'data', listener: (data: AgentStreamEvent) => void) => this
}

export class OpenCodeService implements AgentServiceInterface {
  private client: any | null = null
  private server: any | null = null

  private async ensureInitialized() {
    if (this.client) return

    try {
      // Dynamic import for ESM package in CJS environment
      const { createOpencode } = await import('@opencode-ai/sdk')
      const { client, server } = await createOpencode({
        hostname: '127.0.0.1',
        port: 0 // Auto-select port
      })
      this.client = client
      this.server = server
      logger.info('OpenCode server started', { url: server.url })
    } catch (error) {
      logger.error('Failed to start OpenCode server', error as Error)
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

      const modelInfo = await validateModelId(session.model)
      if (!modelInfo.valid) {
        throw new Error(`Invalid model ID: ${session.model}`)
      }

      // 1. Ensure opencode session exists or create one
      // For simplicity, we'll try to get or create based on our session ID
      const opencodeSessionId = session.id

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
          for await (const event of sseResult.stream) {
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
      aiStream.emit('data', { type: 'error', error: error as Error })
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
