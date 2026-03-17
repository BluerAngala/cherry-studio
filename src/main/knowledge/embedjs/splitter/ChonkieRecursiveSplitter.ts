import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'
import { RecursiveChunker } from 'chonkie'

/**
 * 使用 Chonkie 引擎优化的递归分块器
 * Chonkie 提供了更精准的 Token 计算和更快的切分速度
 */
export class ChonkieRecursiveSplitter extends RecursiveCharacterTextSplitter {
  private chunker: any

  constructor(fields?: any) {
    super(fields)
  }

  async splitText(text: string): Promise<string[]> {
    if (!this.chunker) {
      this.chunker = await RecursiveChunker.create({
        chunkSize: this.chunkSize
      })
    }
    // 使用 Chonkie 进行切分
    const chunks = await this.chunker.chunk(text)
    return chunks.map((c: any) => c.text)
  }
}
