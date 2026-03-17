/**
 * Drizzle ORM schema for knowledge-related tables
 */

import { sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const knowledgeNotesTable = sqliteTable('knowledge_notes', {
  id: text('id').primaryKey(),
  baseId: text('base_id').notNull(),
  type: text('type').notNull(), // e.g., 'note', 'document'
  content: text('content').notNull(),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull()
})

export type KnowledgeNoteRow = typeof knowledgeNotesTable.$inferSelect
export type InsertKnowledgeNoteRow = typeof knowledgeNotesTable.$inferInsert
