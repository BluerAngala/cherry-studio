import { definePlugin } from '../../'
import type { AiRequestContext } from '../../types'
import { buildLawSystemPrompt, defaultLawSearchService, type LawSearchService } from './helper'

export interface LawPluginConfig {
  enabled?: boolean
  searchService?: LawSearchService
}

/**
 * 法律助手插件
 *
 * 功能：
 * 1. 拦截用户请求
 * 2. 识别法律意图（简单关键词匹配或语义分析）
 * 3. 调用法律检索服务
 * 4. 将检索到的法条注入到 System Prompt 中
 */
export const lawPlugin = (config: LawPluginConfig = {}) =>
  definePlugin({
    name: 'lawPlugin',
    enforce: 'pre',

    // 在请求开始前处理参数
    transformParams: async (params: any, context: AiRequestContext) => {
      const { metadata } = context

      // 检查是否启用了法律模式（可以通过前端传递的 metadata 控制）
      // 或者在这里进行意图识别
      const isLawMode = metadata?.custom?.lawMode === true || config.enabled === true

      if (!isLawMode) {
        return params
      }

      const searchService = config.searchService || defaultLawSearchService

      // 获取用户最新的问题
      // 注意：这里假设 messages 数组的最后一条是用户问题
      const messages = params.messages || []
      const lastMessage = messages[messages.length - 1]

      if (!lastMessage || lastMessage.role !== 'user') {
        return params
      }

      const userQuery = lastMessage.content
      if (typeof userQuery !== 'string') {
        return params
      }

      try {
        // 执行法律检索
        const searchResults = await searchService.search(userQuery)

        if (searchResults.length > 0) {
          // 构建注入的 Prompt
          const lawSystemPrompt = buildLawSystemPrompt(searchResults)

          // 将其添加到 System Message 中
          // 策略：如果已有 System Message，则追加；否则新建
          const systemMessageIndex = messages.findIndex((m: any) => m.role === 'system')

          if (systemMessageIndex !== -1) {
            messages[systemMessageIndex].content += `\n\n${lawSystemPrompt}`
          } else {
            // 插入到最前面
            messages.unshift({
              role: 'system',
              content: lawSystemPrompt
            })
          }

          console.log('[LawPlugin] Injected law context into system prompt')
        }
      } catch (error) {
        console.error('[LawPlugin] Search failed:', error)
        // 检索失败不应阻断正常对话，直接忽略错误
      }

      return {
        ...params,
        messages
      }
    }
  })

export * from './helper'
export default lawPlugin
