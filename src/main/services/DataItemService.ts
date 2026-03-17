import type { KnowledgeNoteItem, QuickPhrase } from '@types'
import { eq } from 'drizzle-orm'

import { DatabaseManager } from './agents/database/DatabaseManager'
import { knowledgeNotesTable, quickPhrasesTable } from './agents/database/schema'

export class DataItemService {
  private static instance: DataItemService

  private constructor() {}

  public static getInstance(): DataItemService {
    if (!DataItemService.instance) {
      DataItemService.instance = new DataItemService()
    }
    return DataItemService.instance
  }

  // --- Knowledge Notes ---
  async getKnowledgeNote(id: string): Promise<KnowledgeNoteItem | undefined> {
    const db = (await DatabaseManager.getInstance()).getDatabase()
    const result = await db.select().from(knowledgeNotesTable).where(eq(knowledgeNotesTable.id, id)).limit(1)
    if (result.length === 0) return undefined
    
    const row = result[0]
    return {
      id: row.id,
      baseId: row.baseId,
      type: row.type as 'note',
      content: row.content,
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at)
    }
  }

  async putKnowledgeNote(note: KnowledgeNoteItem): Promise<void> {
    const db = (await DatabaseManager.getInstance()).getDatabase()
    await db.insert(knowledgeNotesTable).values({
      id: note.id,
      baseId: note.baseId,
      type: note.type,
      content: note.content,
      created_at: String(note.createdAt),
      updated_at: String(note.updatedAt)
    }).onConflictDoUpdate({
      target: knowledgeNotesTable.id,
      set: {
        baseId: note.baseId,
        content: note.content,
        updated_at: String(note.updatedAt)
      }
    })
  }

  async deleteKnowledgeNote(id: string): Promise<void> {
    const db = (await DatabaseManager.getInstance()).getDatabase()
    await db.delete(knowledgeNotesTable).where(eq(knowledgeNotesTable.id, id))
  }

  // --- Quick Phrases ---
  async getAllQuickPhrases(): Promise<QuickPhrase[]> {
    const db = (await DatabaseManager.getInstance()).getDatabase()
    const rows = await db.select().from(quickPhrasesTable)
    return rows.map(row => ({
      id: row.id,
      title: row.title,
      content: row.content,
      order: row.order ?? 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }))
  }

  async putQuickPhrase(phrase: QuickPhrase): Promise<void> {
    const db = (await DatabaseManager.getInstance()).getDatabase()
    await db.insert(quickPhrasesTable).values({
      id: phrase.id,
      title: phrase.title,
      content: phrase.content,
      order: phrase.order,
      created_at: phrase.createdAt,
      updated_at: phrase.updatedAt
    }).onConflictDoUpdate({
      target: quickPhrasesTable.id,
      set: {
        title: phrase.title,
        content: phrase.content,
        order: phrase.order,
        updated_at: phrase.updatedAt
      }
    })
  }

  async deleteQuickPhrase(id: string): Promise<void> {
    const db = (await DatabaseManager.getInstance()).getDatabase()
    await db.delete(quickPhrasesTable).where(eq(quickPhrasesTable.id, id))
  }
}

export const dataItemService = DataItemService.getInstance()
