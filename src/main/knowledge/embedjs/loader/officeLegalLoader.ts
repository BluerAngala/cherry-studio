import { BaseLoader } from '@cherrystudio/embedjs-interfaces'
import { cleanString } from '@cherrystudio/embedjs-utils'
import md5 from 'md5'
import { parseOfficeAsync } from 'officeparser'

import { legalCleanString } from '../../utils/text'
import { LegalRecursiveCharacterTextSplitter } from '../splitter/LegalRecursiveCharacterTextSplitter'

/**
 * 专门为法律文档优化的 Office (Docx, Pptx, Xlsx) 加载器
 */
export class OfficeLegalLoader extends BaseLoader<{ type: 'OfficeLegalLoader' }> {
  private readonly filePath: string

  constructor({
    filePath,
    chunkSize,
    chunkOverlap
  }: {
    filePath: string
    chunkSize?: number
    chunkOverlap?: number
  }) {
    super(`OfficeLegalLoader_${md5(filePath)}`, { filePath }, chunkSize ?? 2000, chunkOverlap ?? 200)
    this.filePath = filePath
  }

  override async *getUnfilteredChunks() {
    // 1. 解析 Office 文件
    const rawText = await parseOfficeAsync(this.filePath, {
      newlineDelimiter: ' ',
      ignoreNotes: false
    })

    // 2. 应用法律文本清理
    const cleanedText = legalCleanString(cleanString(rawText))

    // 3. 使用法律优化分块器
    const chunker = new LegalRecursiveCharacterTextSplitter({
      chunkSize: this.chunkSize,
      chunkOverlap: this.chunkOverlap
    })

    const chunks = await chunker.splitText(cleanedText)

    // 4. 生成分块
    for (const chunk of chunks) {
      yield {
        pageContent: chunk,
        metadata: {
          type: 'OfficeLegalLoader' as const,
          source: this.filePath
        }
      }
    }
  }
}
