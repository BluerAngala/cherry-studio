/**
 * @deprecated Scheduled for removal in v2.0.0
 * --------------------------------------------------------------------------
 * ⚠️ NOTICE: V2 DATA&UI REFACTORING (by 0xfullex)
 * --------------------------------------------------------------------------
 * STOP: Feature PRs affecting this file are currently BLOCKED.
 * Only critical bug fixes are accepted during this migration phase.
 *
 * This file is being refactored to v2 standards.
 * Any non-critical changes will conflict with the ongoing work.
 *
 * 🔗 Context & Status:
 * - Contribution Hold: https://github.com/CherryHQ/cherry-studio/issues/10954
 * - v2 Refactor PR   : https://github.com/CherryHQ/cherry-studio/pull/10162
 * --------------------------------------------------------------------------
 */
import { loggerService } from '@logger'
import FileManager from '@renderer/services/FileManager'
import store from '@renderer/store'
import { updateTopicUpdatedAt } from '@renderer/store/assistants'
import type { Message, MessageBlock } from '@renderer/types/newMessage'
import { IpcChannel } from '@shared/IpcChannel'
import { isEmpty } from 'lodash'

import type { MessageDataSource } from './types'

const logger = loggerService.withContext('DexieMessageDataSource')

/**
 * Dexie-based implementation of MessageDataSource
 * Handles local IndexedDB storage for regular chat messages
 */
export class DexieMessageDataSource implements MessageDataSource {
  // ============ Read Operations ============

  async fetchMessages(topicId: string): Promise<{
    messages: Message[]
    blocks: MessageBlock[]
  }> {
    try {
      let topic = await window.electron.ipcRenderer.invoke(IpcChannel.TopicMessage_GetTopic, topicId)
      if (!topic) {
        await window.electron.ipcRenderer.invoke(IpcChannel.TopicMessage_PutTopic, topicId, [])
        topic = { id: topicId, messages: [] }
      }
      const messages = topic?.messages || []

      if (messages.length === 0) {
        return { messages: [], blocks: [] }
      }

      const messageIds = messages.map((m) => m.id)
      const blocks = await window.electron.ipcRenderer.invoke(IpcChannel.TopicMessage_GetMessageBlocks, messageIds)

      // Ensure block IDs are strings for consistency
      const messagesWithBlockIds = messages.map((m) => ({
        ...m,
        blocks: m.blocks?.map(String) || []
      }))

      return { messages: messagesWithBlockIds, blocks: blocks || [] }
    } catch (error) {
      logger.error(`Failed to fetch messages for topic ${topicId}:`, error as Error)
      throw error
    }
  }

  async getRawTopic(topicId: string): Promise<{ id: string; messages: Message[] } | undefined> {
    try {
      return await window.electron.ipcRenderer.invoke(IpcChannel.TopicMessage_GetTopic, topicId)
    } catch (error) {
      logger.error(`Failed to get raw topic ${topicId}:`, error as Error)
      throw error
    }
  }

  // ============ Write Operations ============
  async appendMessage(topicId: string, message: Message, blocks: MessageBlock[], insertIndex?: number): Promise<void> {
    try {
      // Save blocks first
      if (blocks.length > 0) {
        await window.electron.ipcRenderer.invoke(IpcChannel.TopicMessage_PutMessageBlocks, blocks)
      }

      // Get or create topic
      let topic = await window.electron.ipcRenderer.invoke(IpcChannel.TopicMessage_GetTopic, topicId)
      if (!topic) {
        await window.electron.ipcRenderer.invoke(IpcChannel.TopicMessage_PutTopic, topicId, [])
        topic = { id: topicId, messages: [] }
      }

      if (!topic) {
        throw new Error(`Failed to create topic ${topicId}`)
      }

      const updatedMessages = [...(topic.messages || [])]

      // Check if message already exists
      const existingIndex = updatedMessages.findIndex((m) => m.id === message.id)
      if (existingIndex !== -1) {
        updatedMessages[existingIndex] = message
      } else {
        // Insert at specific index or append
        if (insertIndex !== undefined && insertIndex >= 0 && insertIndex <= updatedMessages.length) {
          updatedMessages.splice(insertIndex, 0, message)
        } else {
          updatedMessages.push(message)
        }
      }

      await window.electron.ipcRenderer.invoke(IpcChannel.TopicMessage_PutTopic, topicId, updatedMessages)

      store.dispatch(updateTopicUpdatedAt({ topicId }))
    } catch (error) {
      logger.error(`Failed to append message to topic ${topicId}:`, error as Error)
      throw error
    }
  }

  async updateMessage(topicId: string, messageId: string, updates: Partial<Message>): Promise<void> {
    try {
      const topic = await window.electron.ipcRenderer.invoke(IpcChannel.TopicMessage_GetTopic, topicId)
      if (!topic || !topic.messages) return

      const messageIndex = topic.messages.findIndex((m) => m.id === messageId)
      if (messageIndex !== -1) {
        Object.assign(topic.messages[messageIndex], updates)
        await window.electron.ipcRenderer.invoke(IpcChannel.TopicMessage_PutTopic, topicId, topic.messages)
      }

      store.dispatch(updateTopicUpdatedAt({ topicId }))
    } catch (error) {
      logger.error(`Failed to update message ${messageId} in topic ${topicId}:`, error as Error)
      throw error
    }
  }

  async updateMessageAndBlocks(
    topicId: string,
    messageUpdates: Partial<Message> & Pick<Message, 'id'>,
    blocksToUpdate: MessageBlock[]
  ): Promise<void> {
    try {
      // Update blocks
      if (blocksToUpdate.length > 0) {
        await window.electron.ipcRenderer.invoke(IpcChannel.TopicMessage_PutMessageBlocks, blocksToUpdate)
      }

      // Update message if there are actual changes beyond id and topicId
      const keysToUpdate = Object.keys(messageUpdates).filter((key) => key !== 'id' && key !== 'topicId')
      if (keysToUpdate.length > 0) {
        const topic = await window.electron.ipcRenderer.invoke(IpcChannel.TopicMessage_GetTopic, topicId)
        if (topic && topic.messages) {
          const messageIndex = topic.messages.findIndex((m) => m.id === messageUpdates.id)
          if (messageIndex !== -1) {
            keysToUpdate.forEach((key) => {
              ;(topic.messages[messageIndex] as any)[key] = (messageUpdates as any)[key]
            })
            await window.electron.ipcRenderer.invoke(IpcChannel.TopicMessage_PutTopic, topicId, topic.messages)
          }
        }
      }

      store.dispatch(updateTopicUpdatedAt({ topicId }))
    } catch (error) {
      logger.error(`Failed to update message and blocks for ${messageUpdates.id}:`, error as Error)
      throw error
    }
  }

  async deleteMessage(topicId: string, messageId: string): Promise<void> {
    try {
      const topic = await window.electron.ipcRenderer.invoke(IpcChannel.TopicMessage_GetTopic, topicId)
      if (!topic || !topic.messages) return

      const messageIndex = topic.messages.findIndex((m) => m.id === messageId)
      if (messageIndex === -1) return

      const message = topic.messages[messageIndex]
      const blockIds = message.blocks || []

      // Delete blocks and handle files
      if (blockIds.length > 0) {
        const blocks = await window.electron.ipcRenderer.invoke(IpcChannel.TopicMessage_GetMessageBlocks, blockIds)
        const files = blocks
          .filter((block) => block.type === 'file' || block.type === 'image')
          .map((block: any) => block.file)
          .filter((file) => file !== undefined)

        // Clean up files
        if (!isEmpty(files)) {
          await Promise.all(files.map((file) => FileManager.deleteFile(file.id, false)))
        }

        await window.electron.ipcRenderer.invoke(IpcChannel.TopicMessage_DeleteMessageBlocks, blockIds)
      }

      // Remove message from topic
      topic.messages.splice(messageIndex, 1)
      await window.electron.ipcRenderer.invoke(IpcChannel.TopicMessage_PutTopic, topicId, topic.messages)

      store.dispatch(updateTopicUpdatedAt({ topicId }))
    } catch (error) {
      logger.error(`Failed to delete message ${messageId} from topic ${topicId}:`, error as Error)
      throw error
    }
  }

  async deleteMessages(topicId: string, messageIds: string[]): Promise<void> {
    try {
      const topic = await window.electron.ipcRenderer.invoke(IpcChannel.TopicMessage_GetTopic, topicId)
      if (!topic || !topic.messages) return

      // Collect all block IDs from messages to be deleted
      const allBlockIds: string[] = []
      const messagesToDelete: Message[] = []

      for (const messageId of messageIds) {
        const message = topic.messages.find((m) => m.id === messageId)
        if (message) {
          messagesToDelete.push(message)
          if (message.blocks && message.blocks.length > 0) {
            allBlockIds.push(...message.blocks)
          }
        }
      }

      // Delete blocks and handle files
      if (allBlockIds.length > 0) {
        const blocks = await window.electron.ipcRenderer.invoke(IpcChannel.TopicMessage_GetMessageBlocks, allBlockIds)
        const files = blocks
          .filter((block) => block.type === 'file' || block.type === 'image')
          .map((block: any) => block.file)
          .filter((file) => file !== undefined)

        // Clean up files
        if (!isEmpty(files)) {
          await Promise.all(files.map((file) => FileManager.deleteFile(file.id, false)))
        }
        await window.electron.ipcRenderer.invoke(IpcChannel.TopicMessage_DeleteMessageBlocks, allBlockIds)
      }

      // Remove messages from topic
      const remainingMessages = topic.messages.filter((m) => !messageIds.includes(m.id))
      await window.electron.ipcRenderer.invoke(IpcChannel.TopicMessage_PutTopic, topicId, remainingMessages)
      
      store.dispatch(updateTopicUpdatedAt({ topicId }))
    } catch (error) {
      logger.error(`Failed to delete messages from topic ${topicId}:`, error as Error)
      throw error
    }
  }

  // ============ Block Operations ============

  async updateBlocks(blocks: MessageBlock[]): Promise<void> {
    try {
      if (blocks.length === 0) return
      await window.electron.ipcRenderer.invoke(IpcChannel.TopicMessage_PutMessageBlocks, blocks)
    } catch (error) {
      logger.error('Failed to update blocks:', error as Error)
      throw error
    }
  }

  async updateSingleBlock(blockId: string, updates: Partial<MessageBlock>): Promise<void> {
    try {
      const blocks = await window.electron.ipcRenderer.invoke(IpcChannel.TopicMessage_GetMessageBlocks, [blockId])
      if (blocks && blocks.length > 0) {
        const block = blocks[0]
        Object.assign(block, updates)
        await window.electron.ipcRenderer.invoke(IpcChannel.TopicMessage_PutMessageBlocks, [block])
      }
    } catch (error) {
      logger.error(`Failed to update block ${blockId}:`, error as Error)
      throw error
    }
  }

  async bulkAddBlocks(blocks: MessageBlock[]): Promise<void> {
    try {
      if (blocks.length === 0) return
      await window.electron.ipcRenderer.invoke(IpcChannel.TopicMessage_PutMessageBlocks, blocks)
    } catch (error) {
      logger.error('Failed to bulk add blocks:', error as Error)
      throw error
    }
  }

  async deleteBlocks(blockIds: string[]): Promise<void> {
    try {
      if (blockIds.length === 0) return

      const blocks = await window.electron.ipcRenderer.invoke(IpcChannel.TopicMessage_GetMessageBlocks, blockIds)
      const files = blocks
        .filter((block) => block.type === 'file' || block.type === 'image')
        .map((block: any) => block.file)
        .filter((file) => file !== undefined)

      if (!isEmpty(files)) {
        await Promise.all(files.map((file) => FileManager.deleteFile(file.id, false)))
      }

      await window.electron.ipcRenderer.invoke(IpcChannel.TopicMessage_DeleteMessageBlocks, blockIds)
    } catch (error) {
      logger.error('Failed to delete blocks:', error as Error)
      throw error
    }
  }

  // ============ Batch Operations ============

  async clearMessages(topicId: string): Promise<void> {
    try {
      // First, collect file information and block IDs within a read transaction
      let blockIds: string[] = []
      let files: any[] = []

      const topic = await window.electron.ipcRenderer.invoke(IpcChannel.TopicMessage_GetTopic, topicId)
      if (!topic) return

      // Get all block IDs
      blockIds = topic.messages.flatMap((m) => m.blocks || [])

      // Get blocks and extract file info
      if (blockIds.length > 0) {
        const blocks = await window.electron.ipcRenderer.invoke(IpcChannel.TopicMessage_GetMessageBlocks, blockIds)
        files = blocks
          .filter((block) => block.type === 'file' || block.type === 'image')
          .map((block: any) => block.file)
          .filter((file) => file !== undefined)
      }

      // Delete files outside the transaction to avoid transaction timeout
      if (!isEmpty(files)) {
        await Promise.all(files.map((file) => FileManager.deleteFile(file.id, false)))
      }

      // Delete blocks
      if (blockIds.length > 0) {
        await window.electron.ipcRenderer.invoke(IpcChannel.TopicMessage_DeleteMessageBlocks, blockIds)
      }

      // Clear messages
      await window.electron.ipcRenderer.invoke(IpcChannel.TopicMessage_PutTopic, topicId, [])

      store.dispatch(updateTopicUpdatedAt({ topicId }))
    } catch (error) {
      logger.error(`Failed to clear messages for topic ${topicId}:`, error as Error)
      throw error
    }
  }

  async topicExists(topicId: string): Promise<boolean> {
    try {
      const topic = await window.electron.ipcRenderer.invoke(IpcChannel.TopicMessage_GetTopic, topicId)
      return !!topic
    } catch (error) {
      logger.error(`Failed to check if topic ${topicId} exists:`, error as Error)
      return false
    }
  }

  async ensureTopic(topicId: string): Promise<void> {
    try {
      const exists = await this.topicExists(topicId)
      if (!exists) {
        await window.electron.ipcRenderer.invoke(IpcChannel.TopicMessage_PutTopic, topicId, [])
      }
    } catch (error) {
      logger.error(`Failed to ensure topic ${topicId} exists:`, error as Error)
      throw error
    }
  }

  // ============ File Operations ============

  async updateFileCount(fileId: string, delta: number, deleteIfZero: boolean = false): Promise<void> {
    try {
      const file = await FileManager.getFile(fileId)

      if (!file) {
        logger.warn(`File ${fileId} not found for count update`)
        return
      }

      const newCount = (file.count || 0) + delta

      if (newCount <= 0 && deleteIfZero) {
        // Delete the file when count reaches 0 or below
        await FileManager.deleteFile(fileId, true)
        logger.info(`Deleted file ${fileId} as reference count reached ${newCount}`)
      } else {
        // Update the count
        await window.electron.ipcRenderer.invoke(IpcChannel.FileMetadata_UpdateCount, fileId, Math.max(0, newCount))
        logger.debug(`Updated file ${fileId} count to ${Math.max(0, newCount)}`)
      }
    } catch (error) {
      logger.error(`Failed to update file count for ${fileId}:`, error as Error)
      throw error
    }
  }

  async updateFileCounts(files: Array<{ id: string; delta: number; deleteIfZero?: boolean }>): Promise<void> {
    try {
      for (const file of files) {
        await this.updateFileCount(file.id, file.delta, file.deleteIfZero || false)
      }
    } catch (error) {
      logger.error('Failed to update file counts:', error as Error)
      throw error
    }
  }
}
