/**
 * Drizzle ORM schema for translate-related tables
 */

import { sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const translateHistoryTable = sqliteTable('translate_history', {
  id: text('id').primaryKey(),
  sourceText: text('source_text').notNull(),
  targetText: text('target_text').notNull(),
  sourceLanguage: text('source_language').notNull(),
  targetLanguage: text('target_language').notNull(),
  created_at: text('created_at').notNull()
})

export const translateLanguagesTable = sqliteTable('translate_languages', {
  id: text('id').primaryKey(),
  langCode: text('lang_code').notNull().unique(),
  name: text('name'),
  created_at: text('created_at').notNull()
})

export type TranslateHistoryRow = typeof translateHistoryTable.$inferSelect
export type InsertTranslateHistoryRow = typeof translateHistoryTable.$inferInsert

export type TranslateLanguageRow = typeof translateLanguagesTable.$inferSelect
export type InsertTranslateLanguageRow = typeof translateLanguagesTable.$inferInsert
