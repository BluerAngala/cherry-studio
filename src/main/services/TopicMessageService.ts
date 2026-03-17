import type { Message, MessageBlock } from '@types'
import { eq, inArray, sql } from 'drizzle-orm'

import { DatabaseManager } from './agents/database/DatabaseManager'
import { messageBlocksTable,topicsTable } from './agents/database/schema'

export class TopicMessageService {
  private static instance: TopicMessageService

  private constructor() {}

  public static getInstance(): TopicMessageService {
    if (!TopicMessageService.instance) {
      TopicMessageService.instance = new TopicMessageService()
    }
    return TopicMessageService.instance
  }

  async getTopic(topicId: string): Promise<{ id: string; messages: Message[] } | undefined> {
    const db = (await DatabaseManager.getInstance()).getDatabase()
    const result = await db.select().from(topicsTable).where(eq(topicsTable.id, topicId)).limit(1)
    if (result.length === 0) return undefined
    
    return {
      id: result[0].id,
      messages: JSON.parse(result[0].messages)
    }
  }

  async getAllTopics(): Promise<{ id: string; messages: Message[] }[]> {
    const db = (await DatabaseManager.getInstance()).getDatabase()
    const result = await db.select().from(topicsTable)
    return result.map(row => ({
      id: row.id,
      messages: JSON.parse(row.messages)
    }))
  }

  async getAllMessageBlocks(): Promise<MessageBlock[]> {
    const db = (await DatabaseManager.getInstance()).getDatabase()
    const result = await db.select().from(messageBlocksTable)
    return result.map(row => JSON.parse(row.content))
  }

  async getMessageBlocks(messageIds: string[]): Promise<MessageBlock[]> {
    if (!messageIds || messageIds.length === 0) return []
    
    const db = (await DatabaseManager.getInstance()).getDatabase()
    const result = await db.select().from(messageBlocksTable).where(inArray(messageBlocksTable.message_id, messageIds))
    
    return result.map(row => JSON.parse(row.content))
  }

  async putTopic(topicId: string, messages: Message[]): Promise<void> {
    const db = (await DatabaseManager.getInstance()).getDatabase()
    const messagesStr = JSON.stringify(messages)
    const now = new Date().toISOString()
    
    await db.insert(topicsTable).values({
      id: topicId,
      messages: messagesStr,
      created_at: now,
      updated_at: now
    }).onConflictDoUpdate({
      target: topicsTable.id,
      set: { messages: messagesStr, updated_at: sql`excluded.updated_at` }
    })
  }

  async deleteTopic(topicId: string): Promise<void> {
    const db = (await DatabaseManager.getInstance()).getDatabase()
    await db.delete(topicsTable).where(eq(topicsTable.id, topicId))
  }

  async putMessageBlocks(blocks: MessageBlock[]): Promise<void> {
    if (!blocks || blocks.length === 0) return
    
    const db = (await DatabaseManager.getInstance()).getDatabase()
    const now = new Date().toISOString()
    
    const values = blocks.map(block => ({
      id: block.id,
      message_id: block.messageId,
      content: JSON.stringify(block),
      created_at: block.createdAt || now,
      updated_at: block.updatedAt || now
    }))
    
    await db.insert(messageBlocksTable).values(values).onConflictDoUpdate({
      target: messageBlocksTable.id,
      set: { 
        content: sql`excluded.content`, 
        updated_at: sql`excluded.updated_at`
      }
    })
  }

  async deleteMessageBlocks(blockIds: string[]): Promise<void> {
    if (!blockIds || blockIds.length === 0) return
    
    const db = (await DatabaseManager.getInstance()).getDatabase()
    await db.delete(messageBlocksTable).where(inArray(messageBlocksTable.id, blockIds))
  }
}

export const topicMessageService = TopicMessageService.getInstance()
