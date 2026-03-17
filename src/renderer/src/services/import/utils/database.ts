import { loggerService } from '@logger'
import { IpcChannel } from '@shared/IpcChannel'

import type { ImportResult } from '../types'

const logger = loggerService.withContext('ImportDatabase')

/**
 * Save import result to database
 * Handles saving topics, messages, and message blocks in a transaction
 */
export async function saveImportToDatabase(result: ImportResult): Promise<void> {
  const { topics, messages, blocks } = result

  logger.info(`Saving import: ${topics.length} topics, ${messages.length} messages, ${blocks.length} blocks`)

  // Save all message blocks
  if (blocks.length > 0) {
    await window.electron.ipcRenderer.invoke(IpcChannel.TopicMessage_PutMessageBlocks, blocks)
    logger.info(`Saved ${blocks.length} message blocks`)
  }

  // Save all topics with messages
  for (const topic of topics) {
    const topicMessages = messages.filter((m) => m.topicId === topic.id)
    await window.electron.ipcRenderer.invoke(IpcChannel.TopicMessage_PutTopic, topic.id, topicMessages)
  }
  logger.info(`Saved ${topics.length} topics`)
}
