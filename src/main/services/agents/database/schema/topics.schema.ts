/**
 * Drizzle ORM schema for regular chat topics
 */

import { sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const topicsTable = sqliteTable('topics', {
  id: text('id').primaryKey(),
  messages: text('messages').notNull(), // JSON stringified array of messages
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull()
})

export type TopicRow = typeof topicsTable.$inferSelect
export type InsertTopicRow = typeof topicsTable.$inferInsert
