import { BaseLoader } from '@cherrystudio/embedjs-interfaces'
import { cleanString } from '@cherrystudio/embedjs-utils'
import type { ChunkingStrategy } from '@types'
import md5 from 'md5'
import { parseOfficeAsync } from 'officeparser'

import { legalCleanString } from '../../utils/text'
import { ChonkieRecursiveSplitter } from '../splitter/ChonkieRecursiveSplitter'
import { LegalRecursiveCharacterTextSplitter } from '../splitter/LegalRecursiveCharacterTextSplitter'
import { SemanticLegalSplitter } from '../splitter/SemanticLegalSplitter'

/**
 * 专门为法律文档优化的 Office (Docx, Pptx, Xlsx) 加载器
 */
export class OfficeLegalLoader extends BaseLoader<{ type: 'OfficeLegalLoader' }> {
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
    super(`OfficeLegalLoader_${md5(filePath)}`, { filePath }, chunkSize ?? 2000, chunkOverlap ?? 200)
    this.filePath = filePath
    this.chunkingStrategy = chunkingStrategy || 'recursive'
    this.embeddings = embeddings
  }

  override async *getUnfilteredChunks() {
    // 1. 解析 Office 文件
    let rawText = ''
    try {
      rawText = await parseOfficeAsync(this.filePath, {
        newlineDelimiter: ' ',
        ignoreNotes: false
      })
    } catch (e) {
      throw new Error(`Failed to parse Office file: ${e instanceof Error ? e.message : String(e)}`)
    }

    if (!rawText) {
      rawText = ''
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
      chunker = new ChonkieRecursiveSplitter({
        chunkSize: this.chunkSize,
        chunkOverlap: this.chunkOverlap
      })
    } else {
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
          type: 'OfficeLegalLoader' as const,
          source: this.filePath,
          strategy: this.chunkingStrategy
        }
      }
    }
  }
}
