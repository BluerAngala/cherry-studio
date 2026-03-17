/**
 * 法律检索结果
 */
export interface LawSearchResult {
  title: string
  content: string
  source: string
  relevance: number
}

/**
 * 法律检索服务接口
 */
export interface LawSearchService {
  search(query: string): Promise<LawSearchResult[]>
}

/**
 * 默认的法律检索服务（Mock 实现）
 * 在实际应用中，这里应该调用真实的法律数据库 API
 */
export const defaultLawSearchService: LawSearchService = {
  search: async (query: string) => {
    // 这里只是模拟检索逻辑
    // 实际场景中，你应该在这里调用你的后端 API 或本地向量数据库
    console.log(`[LawPlugin] Searching for law related to: ${query}`)

    const results: LawSearchResult[] = []

    if (query.includes('合同') || query.includes('违约')) {
      results.push({
        title: '中华人民共和国民法典 第五百七十七条',
        content:
          '当事人一方不履行合同义务或者履行合同义务不符合约定的，应当承担继续履行、采取补救措施或者赔偿损失等违约责任。',
        source: '民法典',
        relevance: 0.95
      })
    }

    if (query.includes('婚姻') || query.includes('离婚')) {
      results.push({
        title: '中华人民共和国民法典 第一千零七十九条',
        content:
          '夫妻一方要求离婚的，可以由有关组织进行调解或者直接向人民法院提起离婚诉讼。人民法院审理离婚案件，应当进行调解；如果感情确已破裂，调解无效的，应当准予离婚。',
        source: '民法典',
        relevance: 0.92
      })
    }

    if (query.includes('劳动') || query.includes('加班')) {
      results.push({
        title: '中华人民共和国劳动法 第四十四条',
        content:
          '有下列情形之一的，用人单位应当按照下列标准支付高于劳动者正常工作时间工资的工资报酬：（一）安排劳动者延长工作时间的，支付不低于工资的百分之一百五十的工资报酬；...',
        source: '劳动法',
        relevance: 0.88
      })
    }

    return results
  }
}

/**
 * 构建系统提示词，注入法律条文
 */
export function buildLawSystemPrompt(results: LawSearchResult[]): string {
  if (results.length === 0) return ''

  const lawContext = results
    .map((r, index) => `[参考资料${index + 1}] ${r.source} - ${r.title}\n内容：${r.content}`)
    .join('\n\n')

  return `
【法律助手模式已激活】
请根据以下参考的法律条文回答用户的问题。回答时请引用具体的法律条款。

---参考法律条文开始---
${lawContext}
---参考法律条文结束---
`
}
