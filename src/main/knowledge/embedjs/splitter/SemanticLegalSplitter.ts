import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'
import { loggerService } from '@logger'

const logger = loggerService.withContext('SemanticLegalSplitter')

/**
 * 语义分块器 (Semantic Chunking)
 * 原理：将文本拆分为句子，计算相邻句子的 Embedding 相似度，在语义发生转折处切分。
 * 结合了法律文档的结构化特征。
 */
export class SemanticLegalSplitter extends RecursiveCharacterTextSplitter {
  private embeddings: any
  private threshold: number

  constructor(fields: { embeddings: any; threshold?: number; chunkSize?: number; chunkOverlap?: number }) {
    super(fields)
    this.embeddings = fields.embeddings
    this.threshold = fields.threshold ?? 0.85
  }

  async splitText(text: string): Promise<string[]> {
    if (!text.trim()) return []

    // 1. 初步拆分为句子（使用正则，结合中文标点）
    const sentences = text
      .split(/([。！？；]|\n+)/)
      .reduce((acc: string[], curr, idx) => {
        if (idx % 2 === 0) {
          acc.push(curr)
        } else {
          acc[acc.length - 1] += curr
        }
        return acc
      }, [])
      .filter((s) => s.trim().length > 0)

    if (sentences.length <= 1) return sentences

    try {
      // 2. 计算所有句子的 Embedding
      logger.info(`[SemanticSplitter] 开始计算 ${sentences.length} 个句子的 Embedding...`)
      const sentenceEmbeddings = await this.embeddings.embedDocuments(sentences)

      // 3. 计算相邻句子的余弦相似度并寻找断点
      const chunks: string[] = []
      let currentChunk = sentences[0]

      for (let i = 0; i < sentenceEmbeddings.length - 1; i++) {
        const similarity = this.cosineSimilarity(sentenceEmbeddings[i], sentenceEmbeddings[i + 1])

        // 如果相似度低于阈值，或者当前块已经达到 chunkSize，则切分
        if (similarity < this.threshold || currentChunk.length > this.chunkSize) {
          chunks.push(currentChunk)
          currentChunk = sentences[i + 1]
        } else {
          currentChunk += sentences[i + 1]
        }
      }
      chunks.push(currentChunk)

      return chunks
    } catch (e) {
      logger.error('Semantic splitting failed, falling back to recursive splitting:', e as Error)
      return super.splitText(text)
    }
  }

  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    let dotProduct = 0
    let normA = 0
    let normB = 0
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i]
      normA += vecA[i] * vecA[i]
      normB += vecB[i] * vecB[i]
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
  }
}
