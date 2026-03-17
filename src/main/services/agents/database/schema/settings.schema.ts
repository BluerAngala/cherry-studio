/**
 * Drizzle ORM schema for settings table
 */

import { sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const settingsTable = sqliteTable('settings', {
  id: text('id').primaryKey(), // setting key
  value: text('value').notNull(), // JSON stringified value
  updated_at: text('updated_at').notNull()
})

export type SettingRow = typeof settingsTable.$inferSelect
export type InsertSettingRow = typeof settingsTable.$inferInsert
