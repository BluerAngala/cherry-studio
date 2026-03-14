/**
 * 工具执行器
 *
 * 负责工具的执行、结果格式化和相关事件发送
 * 从 promptToolUsePlugin.ts 中提取出来以降低复杂度
 */
import type { ToolSet, TypedToolError } from 'ai'

import type { ToolUseResult } from './type'

/**
 * 工具执行结果
 */
export interface ExecutedResult {
  toolCallId: string
  toolName: string
  result: unknown
  isError?: boolean
}

/**
 * 工具执行历史记录项
 */
interface ToolExecutionHistoryItem {
  toolName: string
  arguments: string // JSON stringified arguments for comparison
  isError: boolean
  errorType?: string
  retryCount: number
  timestamp: number
}

/**
 * 流控制器类型（从 AI SDK 提取）
 * Generic type parameter allows for type-safe chunk enqueuing
 */
export interface StreamController<TChunk = unknown> {
  enqueue(chunk: TChunk): void
}

/**
 * 可重试错误类型（网络超时、连接错误等）
 */
const RETRYABLE_ERROR_PATTERNS = [
  /timeout/i,
  /network/i,
  /connection/i,
  /econnrefused/i,
  /etimedout/i,
  /socket/i,
  /fetch/i,
  /abort/i
]

/**
 * 工具执行器类
 */
export class ToolExecutor {
  // 工具执行历史记录，用于防止死循环
  private executionHistory: Map<string, ToolExecutionHistoryItem> = new Map()
  // 最大重试次数
  private readonly maxRetries: number
  // 历史记录过期时间（毫秒）- 5分钟
  private readonly historyExpiryMs: number = 5 * 60 * 1000

  constructor(maxRetries: number = 2) {
    this.maxRetries = maxRetries
  }

  /**
   * 生成工具调用的唯一标识
   */
  private getToolCallKey(toolName: string, args: unknown): string {
    try {
      const sortedArgs = this.sortObjectKeys(args)
      return `${toolName}:${JSON.stringify(sortedArgs)}`
    } catch {
      return `${toolName}:${String(args)}`
    }
  }

  /**
   * 递归排序对象键，确保相同的参数生成相同的key
   */
  private sortObjectKeys(obj: unknown): unknown {
    if (obj === null || typeof obj !== 'object') {
      return obj
    }
    if (Array.isArray(obj)) {
      return obj.map((item) => this.sortObjectKeys(item))
    }
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
      sorted[key] = this.sortObjectKeys((obj as Record<string, unknown>)[key])
    }
    return sorted
  }

  /**
   * 检查错误是否可重试
   */
  private isRetryableError(error: unknown): boolean {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return RETRYABLE_ERROR_PATTERNS.some((pattern) => pattern.test(errorMessage))
  }

  /**
   * 清理过期的历史记录
   */
  private cleanupExpiredHistory(): void {
    const now = Date.now()
    for (const [key, item] of this.executionHistory.entries()) {
      if (now - item.timestamp > this.historyExpiryMs) {
        this.executionHistory.delete(key)
      }
    }
  }

  /**
   * 检查是否应该跳过此工具调用（防止死循环）
   * @returns 如果应该跳过，返回跳过的原因；否则返回 null
   */
  private shouldSkipToolCall(toolName: string, args: unknown): string | null {
    this.cleanupExpiredHistory()

    const key = this.getToolCallKey(toolName, args)
    const history = this.executionHistory.get(key)

    if (!history) {
      return null
    }

    // 如果之前执行成功，不再重复执行
    if (!history.isError) {
      return `Tool "${toolName}" was already executed successfully with the same arguments`
    }

    // 如果是不可重试的错误，不再重复执行
    if (history.errorType && !this.isRetryableError({ message: history.errorType })) {
      return `Tool "${toolName}" failed with a non-retryable error, skipping to prevent infinite loop`
    }

    // 检查重试次数
    if (history.retryCount >= this.maxRetries) {
      return `Tool "${toolName}" has reached max retry attempts (${this.maxRetries}), skipping to prevent infinite loop`
    }

    return null
  }

  /**
   * 记录工具执行结果
   */
  private recordExecution(toolName: string, args: unknown, isError: boolean, error?: unknown): void {
    const key = this.getToolCallKey(toolName, args)
    const existing = this.executionHistory.get(key)

    this.executionHistory.set(key, {
      toolName,
      arguments: JSON.stringify(args),
      isError,
      errorType: error instanceof Error ? error.message : String(error),
      retryCount: existing ? existing.retryCount + 1 : 0,
      timestamp: Date.now()
    })
  }

  /**
   * 执行多个工具调用
   */
  async executeTools(
    toolUses: ToolUseResult[],
    tools: ToolSet,
    controller: StreamController,
    abortSignal?: AbortSignal
  ): Promise<ExecutedResult[]> {
    const executedResults: ExecutedResult[] = []

    for (const toolUse of toolUses) {
      // 检查是否需要中止
      if (abortSignal?.aborted) {
        const abortResult: ExecutedResult = {
          toolCallId: toolUse.id,
          toolName: toolUse.toolName,
          result: new Error('Tool execution aborted'),
          isError: true
        }
        executedResults.push(abortResult)
        continue
      }

      // 检查是否应该跳过（防止死循环）
      const skipReason = this.shouldSkipToolCall(toolUse.toolName, toolUse.arguments)
      if (skipReason) {
        console.warn(`[MCP Prompt Stream] ${skipReason}`)
        const skipResult: ExecutedResult = {
          toolCallId: toolUse.id,
          toolName: toolUse.toolName,
          result: skipReason,
          isError: true
        }
        // 发送 tool-call 事件
        controller.enqueue({
          type: 'tool-call',
          toolCallId: toolUse.id,
          toolName: toolUse.toolName,
          input: toolUse.arguments
        })
        // 发送错误结果
        controller.enqueue({
          type: 'tool-result',
          toolCallId: toolUse.id,
          toolName: toolUse.toolName,
          input: toolUse.arguments,
          output: skipReason
        })
        executedResults.push(skipResult)
        continue
      }

      try {
        const tool = tools[toolUse.toolName]
        if (!tool || typeof tool.execute !== 'function') {
          throw new Error(`Tool "${toolUse.toolName}" has no execute method`)
        }

        // 发送 tool-call 事件
        controller.enqueue({
          type: 'tool-call',
          toolCallId: toolUse.id,
          toolName: toolUse.toolName,
          input: toolUse.arguments
        })

        const result = await tool.execute(toolUse.arguments, {
          toolCallId: toolUse.id,
          messages: [],
          abortSignal: abortSignal ?? new AbortController().signal
        })

        // 发送 tool-result 事件
        controller.enqueue({
          type: 'tool-result',
          toolCallId: toolUse.id,
          toolName: toolUse.toolName,
          input: toolUse.arguments,
          output: result
        })

        // 记录成功执行
        this.recordExecution(toolUse.toolName, toolUse.arguments, false)

        executedResults.push({
          toolCallId: toolUse.id,
          toolName: toolUse.toolName,
          result,
          isError: false
        })
      } catch (error) {
        console.error(`[MCP Prompt Stream] Tool execution failed: ${toolUse.toolName}`, error)

        // 记录失败执行
        this.recordExecution(toolUse.toolName, toolUse.arguments, true, error)

        // 处理错误情况
        const errorResult = this.handleToolError(toolUse, error, controller)
        executedResults.push(errorResult)
      }
    }

    return executedResults
  }

  /**
   * 格式化工具结果为 Cherry Studio 标准格式
   */
  formatToolResults(executedResults: ExecutedResult[]): string {
    return executedResults
      .map((tr) => {
        if (!tr.isError) {
          return `<tool_use_result>\n  <name>${tr.toolName}</name>\n  <result>${JSON.stringify(tr.result)}</result>\n</tool_use_result>`
        } else {
          const error = tr.result || 'Unknown error'
          return `<tool_use_result>\n  <name>${tr.toolName}</name>\n  <error>${error}</error>\n</tool_use_result>`
        }
      })
      .join('\n\n')
  }

  /**
   * 处理工具执行错误
   */
  private handleToolError<T extends ToolSet>(
    toolUse: ToolUseResult,
    error: unknown,
    controller: StreamController
  ): ExecutedResult {
    // 使用 AI SDK 标准错误格式
    const toolError: TypedToolError<T> = {
      type: 'tool-error',
      toolCallId: toolUse.id,
      toolName: toolUse.toolName,
      input: toolUse.arguments,
      error
    }

    controller.enqueue(toolError)

    return {
      toolCallId: toolUse.id,
      toolName: toolUse.toolName,
      result: error,
      isError: true
    }
  }

  /**
   * 重置执行历史（用于新的对话）
   */
  resetHistory(): void {
    this.executionHistory.clear()
  }
}
