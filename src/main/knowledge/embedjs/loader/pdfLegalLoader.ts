import { BaseLoader } from '@cherrystudio/embedjs-interfaces'
import { cleanString } from '@cherrystudio/embedjs-utils'
import * as fs from 'fs'
import md5 from 'md5'
import pdf from 'pdf-parse'

import { legalCleanString } from '../../utils/text'
import { LegalRecursiveCharacterTextSplitter } from '../splitter/LegalRecursiveCharacterTextSplitter'

/**
 * 专门为法律文档优化的 PDF 加载器
 * 提取 PDF 文本并应用法律行业特有的清理和分块逻辑
 */
export class PdfLegalLoader extends BaseLoader<{ type: 'PdfLegalLoader' }> {
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
    super(`PdfLegalLoader_${md5(filePath)}`, { filePath }, chunkSize ?? 2000, chunkOverlap ?? 200)
    this.filePath = filePath
  }

  override async *getUnfilteredChunks() {
    // 1. 读取并解析 PDF
    const dataBuffer = fs.readFileSync(this.filePath)
    const data = await pdf(dataBuffer)
    const rawText = data.text

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
          type: 'PdfLegalLoader' as const,
          source: this.filePath,
          pageCount: data.numpages,
          info: data.info
        }
      }
    }
  }
}
