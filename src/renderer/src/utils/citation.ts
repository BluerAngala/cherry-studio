import type { GroundingSupport } from '@google/genai'
import type { Citation, WebSearchSource } from '@renderer/types'
import { WEB_SEARCH_SOURCE } from '@renderer/types'

import { cleanMarkdownContent, encodeHTML } from './formats'

/**
 * 从多个 citationReference 中获取第一个有效的 source
 * @returns WebSearchSource
 */
export function determineCitationSource(
  citationReferences: Array<{ citationBlockId?: string; citationBlockSource?: WebSearchSource }> | undefined
): WebSearchSource | undefined {
  // 从 citationReferences 获取第一个有效的 source
  if (citationReferences?.length) {
    const validReference = citationReferences.find((ref) => ref.citationBlockSource)
    return validReference?.citationBlockSource
  }

  return undefined
}

/**
 * 把文本内容中的引用标记转换为完整的引用标签
 * - 标准化引用标记
 * - 转换标记为用于渲染的标签
 *
 * @param content 原始文本内容
 * @param citations 原始引用列表
 * @param sourceType 引用来源类型
 * @returns 处理后的文本内容
 */
export function withCitationTags(content: string, citations: Citation[], sourceType?: WebSearchSource): string {
  if (!content || citations.length === 0) return content

  const formattedCitations = citations.map((citation) => ({
    ...citation,
    content: citation.content ? cleanMarkdownContent(citation.content) : citation.content
  }))

  const citationMap = new Map(formattedCitations.map((c) => [c.number, c]))

  const normalizedContent = normalizeCitationMarks(content, citationMap, sourceType)

  return mapCitationMarksToTags(normalizedContent, citationMap)
}

/**
 * 标准化引用标记，统一转换为 [cite:N] 格式：
 * - OpenAI 格式: [<sup>N</sup>](url) → [cite:N]
 * - Gemini 格式: 根据metadata添加 [cite:N]
 * - 其他格式: [N] → [cite:N]
 *
 * 算法：
 * - one pass + 正则替换
 * - 跳过代码块等特殊上下文
 *
 * @param content 原始文本内容
 * @param citationMap 引用映射表
 * @param sourceType 引用来源类型
 * @returns 标准化后的文本内容
 */
export function normalizeCitationMarks(
  content: string,
  citationMap: Map<number, Citation>,
  sourceType?: WebSearchSource
): string {
  // 识别需要跳过的代码区域，注意：indented code block已被禁用，不需要跳过
  const codeBlockRegex = /```[\s\S]*?```|`[^`\n]*`/gm
  const skipRanges: Array<{ start: number; end: number }> = []

  let match
  while ((match = codeBlockRegex.exec(content)) !== null) {
    skipRanges.push({
      start: match.index,
      end: match.index + match[0].length
    })
  }

  // 检查位置是否在代码块内
  const shouldSkip = (pos: number): boolean => {
    for (const range of skipRanges) {
      if (pos >= range.start && pos < range.end) return true
      if (range.start > pos) break // 已排序，可以提前结束
    }
    return false
  }

  // 统一的替换函数
  const applyReplacements = (regex: RegExp, getReplacementFn: (match: RegExpExecArray) => string | null) => {
    const replacements: Array<{ start: number; end: number; replacement: string }> = []

    regex.lastIndex = 0 // 重置正则状态
    let match: RegExpExecArray | null
    while ((match = regex.exec(content)) !== null) {
      if (!shouldSkip(match.index)) {
        const replacement = getReplacementFn(match)
        if (replacement !== null) {
          replacements.push({
            start: match.index,
            end: match.index + match[0].length,
            replacement
          })
        }
      }
    }

    // 从后往前替换避免位置偏移
    replacements.reverse().forEach(({ start, end, replacement }) => {
      content = content.slice(0, start) + replacement + content.slice(end)
    })
  }

  switch (sourceType) {
    case WEB_SEARCH_SOURCE.OPENAI:
    case WEB_SEARCH_SOURCE.OPENAI_RESPONSE:
    case WEB_SEARCH_SOURCE.PERPLEXITY: {
      // OpenAI 格式: [<sup>N</sup>](url) → [cite:N]
      applyReplacements(/\[<sup>(\d+)<\/sup>\]\([^)]*\)/g, (match) => {
        const citationNum = parseInt(match[1], 10)
        return citationMap.has(citationNum) ? `[cite:${citationNum}]` : null
      })
      break
    }
    case WEB_SEARCH_SOURCE.GEMINI: {
      // Gemini 格式: 根据metadata添加 [cite:N]
      const firstCitation = Array.from(citationMap.values())[0]
      if (firstCitation?.metadata) {
        const textReplacements = new Map<string, string>()

        // 收集所有需要替换的文本
        firstCitation.metadata.forEach((support: GroundingSupport) => {
          if (!support.groundingChunkIndices || !support.segment?.text) return

          const citationNums = support.groundingChunkIndices
          const text = support.segment.text
          const basicTag = citationNums
            .map((citationNum) => {
              const citation = citationMap.get(citationNum + 1)
              return citation ? `[cite:${citationNum + 1}]` : ''
            })
            .filter(Boolean)
            .join('')

          if (basicTag) {
            textReplacements.set(text, `${text}${basicTag}`)
          }
        })

        // 一次性应用所有替换
        textReplacements.forEach((replacement, originalText) => {
          const escapedText = originalText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          applyReplacements(new RegExp(escapedText, 'g'), () => replacement)
        })
      }
      break
    }
    default: {
      // 简单数字格式: [N] → [cite:N]
      applyReplacements(/\[(\d+)\]/g, (match) => {
        const citationNum = parseInt(match[1], 10)
        return citationMap.has(citationNum) ? `[cite:${citationNum}]` : null
      })
    }
  }

  return content
}

/**
 * 提取并高亮最相关的上下文
 * 使用 Bi-gram (二元语法) 算法计算句子与查询的相似度
 */
export function highlightRelevantContext(text: string, query: string): string {
  if (!text || !query) return text

  // 1. 将文本拆分为句子
  const sentenceRegex = /[^。！？.!\n]+[。！？.!\n]*/g
  const sentences = text.match(sentenceRegex) || [text]

  if (sentences.length <= 1) return text

  // 2. 提取查询的 Bigrams
  const getBigrams = (str: string) => {
    const cleanStr = str.replace(/\s+/g, '')
    const bigrams = new Set<string>()
    for (let i = 0; i < cleanStr.length - 1; i++) {
      bigrams.add(cleanStr.slice(i, i + 2))
    }
    return bigrams
  }

  const queryBigrams = getBigrams(query)
  if (queryBigrams.size === 0) return text.substring(0, 500) + (text.length > 500 ? '...' : '')

  let maxScore = -1
  let bestIndex = -1

  // 3. 计算每个句子的得分
  sentences.forEach((sentence, index) => {
    let score = 0
    const sentenceBigrams = getBigrams(sentence)

    for (const bg of queryBigrams) {
      if (sentenceBigrams.has(bg)) {
        score++
      }
    }

    // 对稍长一点的句子给予微小奖励，避免选中过短的无意义片段
    score = score * (Math.min(sentence.length, 50) / 50)

    if (score > maxScore) {
      maxScore = score
      bestIndex = index
    }
  })

  // 4. 高亮最高分句子，并截取上下文
  if (bestIndex !== -1 && maxScore > 0.1) {
    const escapedSentences = sentences.map((s) => encodeHTML(s))
    escapedSentences[bestIndex] = `<mark>${escapedSentences[bestIndex].trim()}</mark>`
    // 只保留最相关句子及其前后各1-2句作为上下文，实现"精量"返回
    const start = Math.max(0, bestIndex - 2)
    const end = Math.min(escapedSentences.length, bestIndex + 3)
    return escapedSentences.slice(start, end).join(' ')
  }

  return encodeHTML(text.substring(0, 500) + (text.length > 500 ? '...' : ''))
}

/**
 * 把文本内容中的 [cite:N] 标记转换为用于渲染的标签
 * @param content 原始文本内容
 * @param citationMap 引用映射表
 * @returns 处理后的文本内容
 */
export function mapCitationMarksToTags(content: string, citationMap: Map<number, Citation>): string {
  // 统一替换所有 [cite:N] 标记
  return content.replace(/\[cite:(\d+)\]/g, (match, num, offset, fullString) => {
    const citationNum = parseInt(num, 10)
    const citation = citationMap.get(citationNum)

    if (citation) {
      // 获取上下文（前后各 100 字符）作为查询
      const start = Math.max(0, offset - 100)
      const end = Math.min(fullString.length, offset + match.length + 100)
      const context = fullString.substring(start, end)

      // 使用上下文动态提取并高亮相关内容
      const highlightedContent = highlightRelevantContext(citation.content || '', context)

      return generateCitationTag(citation, highlightedContent)
    }

    // 如果没找到对应的引用数据，保持原样（应该不会发生）
    return match
  })
}

/**
 * 生成单个用于渲染的引用标签
 * @param citation 引用数据
 * @param customContent 自定义显示内容（可选）
 * @returns 渲染后的引用标签
 */
export function generateCitationTag(citation: Citation, customContent?: string): string {
  const supData = {
    id: citation.number,
    url: citation.url,
    title: citation.title || citation.hostname || '',
    content: customContent || citation.content?.substring(0, 200)
  }
  const citationJson = encodeHTML(JSON.stringify(supData))

  // 判断是否为有效链接
  const isLink = citation.url && citation.url.startsWith('http')

  // 生成链接格式: [<sup data-citation='...'>N</sup>](url)
  // 或者生成空括号格式: [<sup data-citation='...'>N</sup>]()
  return `[<sup data-citation='${citationJson}'>${citation.number}</sup>]` + (isLink ? `(${citation.url})` : '()')
}
