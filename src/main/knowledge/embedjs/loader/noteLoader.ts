import { BaseLoader } from '@cherrystudio/embedjs-interfaces'
import { cleanString } from '@cherrystudio/embedjs-utils'
import md5 from 'md5'

import { legalCleanString } from '../../utils/text'
import { LegalRecursiveCharacterTextSplitter } from '../splitter/LegalRecursiveCharacterTextSplitter'

export class NoteLoader extends BaseLoader<{ type: 'NoteLoader' }> {
  private readonly text: string
  private readonly sourceUrl?: string

  constructor({
    text,
    sourceUrl,
    chunkSize,
    chunkOverlap
  }: {
    text: string
    sourceUrl?: string
    chunkSize?: number
    chunkOverlap?: number
  }) {
    super(`NoteLoader_${md5(text + (sourceUrl || ''))}`, { text, sourceUrl }, chunkSize ?? 2000, chunkOverlap ?? 0)
    this.text = text
    this.sourceUrl = sourceUrl
  }

  override async *getUnfilteredChunks() {
    const chunker = new LegalRecursiveCharacterTextSplitter({
      chunkSize: this.chunkSize,
      chunkOverlap: this.chunkOverlap
    })

    const chunks = await chunker.splitText(legalCleanString(cleanString(this.text)))

    for (const chunk of chunks) {
      yield {
        pageContent: chunk,
        metadata: {
          type: 'NoteLoader' as const,
          source: this.sourceUrl || 'note'
        }
      }
    }
  }
}
