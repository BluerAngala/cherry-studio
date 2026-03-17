/**
 * Drizzle ORM schema for message blocks
 */

import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const messageBlocksTable = sqliteTable(
  'message_blocks',
  {
    id: text('id').primaryKey(),
    message_id: text('message_id').notNull(),
    content: text('content').notNull(), // JSON stringified message block
    created_at: text('created_at').notNull(),
    updated_at: text('updated_at').notNull()
  },
  (table) => {
    return {
      messageIdIdx: index('idx_message_blocks_message_id').on(table.message_id)
    }
  }
)

export type MessageBlockRow = typeof messageBlocksTable.$inferSelect
export type InsertMessageBlockRow = typeof messageBlocksTable.$inferInsert
