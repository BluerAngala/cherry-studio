import { BaseLoader } from '@cherrystudio/embedjs-interfaces'
import { cleanString } from '@cherrystudio/embedjs-utils'
import { loggerService } from '@logger'
import type { ChunkingStrategy } from '@types'
import * as fs from 'fs'
import md5 from 'md5'
import pdf from 'pdf-parse'

import { legalCleanString } from '../../utils/text'
import { ChonkieRecursiveSplitter } from '../splitter/ChonkieRecursiveSplitter'
import { LegalRecursiveCharacterTextSplitter } from '../splitter/LegalRecursiveCharacterTextSplitter'
import { SemanticLegalSplitter } from '../splitter/SemanticLegalSplitter'

const logger = loggerService.withContext('PdfLegalLoader')

/**
 * 专门为法律文档优化的 PDF 加载器
 * 提取 PDF 文本并应用法律行业特有的清理和分块逻辑
 */
export class PdfLegalLoader extends BaseLoader<{ type: 'PdfLegalLoader' }> {
  private readonly filePath: string
  private readonly chunkingStrategy: ChunkingStrategy
  private readonly embeddings: any

  constructor({
    filePath,
    chunkSize,
    chunkOverlap,
    chunkingStrategy,
    embeddings
  }: {
    filePath: string
    chunkSize?: number
    chunkOverlap?: number
    chunkingStrategy?: ChunkingStrategy
    embeddings?: any
  }) {
    super(`PdfLegalLoader_${md5(filePath)}`, { filePath }, chunkSize ?? 2000, chunkOverlap ?? 200)
    this.filePath = filePath
    this.chunkingStrategy = chunkingStrategy || 'recursive'
    this.embeddings = embeddings
  }

  override async *getUnfilteredChunks() {
    // 1. 读取并解析 PDF
    let dataBuffer: Buffer
    try {
      dataBuffer = fs.readFileSync(this.filePath)
    } catch (e) {
      logger.error(`Failed to read file: ${this.filePath}`, e as Error)
      throw new Error(`Failed to read PDF file: ${e instanceof Error ? e.message : String(e)}`)
    }

    let data: any
    try {
      // 兼容某些环境下 pdf-parse 的导入问题
      const pdfParser = typeof pdf === 'function' ? pdf : (pdf as any).default
      if (typeof pdfParser !== 'function') {
        throw new Error('pdf-parse is not a function')
      }
      data = await pdfParser(dataBuffer)
    } catch (e) {
      logger.error(`Failed to parse PDF: ${this.filePath}`, e as Error)
      throw new Error(`Failed to parse PDF content: ${e instanceof Error ? e.message : String(e)}`)
    }

    const rawText = data?.text || ''
    if (!rawText.trim()) {
      logger.warn(`PDF extracted text is empty: ${this.filePath}`)
    }

    // 2. 应用法律文本清理
    const cleanedText = legalCleanString(cleanString(rawText))

    // 3. 根据策略选择分块器
    let chunker: any
    if (this.chunkingStrategy === 'semantic' && this.embeddings) {
      chunker = new SemanticLegalSplitter({
        embeddings: this.embeddings,
        chunkSize: this.chunkSize,
        chunkOverlap: this.chunkOverlap
      })
    } else if (this.chunkingStrategy === 'recursive') {
      // 默认使用 Chonkie 优化的递归分块
      chunker = new ChonkieRecursiveSplitter({
        chunkSize: this.chunkSize,
        chunkOverlap: this.chunkOverlap
      })
    } else {
      // 结构化回退到法律递归分块（PDF 暂时不支持真正的结构化，除非使用布局分析）
      chunker = new LegalRecursiveCharacterTextSplitter({
        chunkSize: this.chunkSize,
        chunkOverlap: this.chunkOverlap
      })
    }

    const chunks = await chunker.splitText(cleanedText)

    // 4. 生成分块
    for (const chunk of chunks) {
      yield {
        pageContent: chunk,
        metadata: {
          type: 'PdfLegalLoader' as const,
          source: this.filePath,
          pageCount: data.numpages,
          info: data.info,
          strategy: this.chunkingStrategy
        }
      }
    }
  }
}
