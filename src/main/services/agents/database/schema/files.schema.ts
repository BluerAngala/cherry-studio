/**
 * Drizzle ORM schema for files table
 */

import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const filesTable = sqliteTable('files', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  origin_name: text('origin_name'),
  path: text('path').notNull(),
  size: integer('size').notNull(),
  ext: text('ext'),
  type: text('type'),
  count: integer('count').default(0),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull()
})

export type FileRow = typeof filesTable.$inferSelect
export type InsertFileRow = typeof filesTable.$inferInsert
