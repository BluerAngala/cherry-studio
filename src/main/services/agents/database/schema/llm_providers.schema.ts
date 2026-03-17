/**
 * Drizzle ORM schema for llm_providers table
 */

import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const llmProvidersTable = sqliteTable('llm_providers', {
  id: text('id').primaryKey(), // provider id
  name: text('name').notNull(),
  api_key: text('api_key'),
  api_host: text('api_host'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  is_system: integer('is_system', { mode: 'boolean' }).notNull().default(false),
  models: text('models'), // JSON stringified array of models
  config: text('config'), // JSON stringified additional configuration
  order: integer('order').notNull().default(0),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull()
})

export type LlmProviderRow = typeof llmProvidersTable.$inferSelect
export type InsertLlmProviderRow = typeof llmProvidersTable.$inferInsert
