/**
 * Drizzle ORM schema for quick phrases
 */

import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const quickPhrasesTable = sqliteTable('quick_phrases', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  order: integer('order').default(0),
  created_at: integer('created_at').notNull(),
  updated_at: integer('updated_at').notNull()
})

export type QuickPhraseRow = typeof quickPhrasesTable.$inferSelect
export type InsertQuickPhraseRow = typeof quickPhrasesTable.$inferInsert
