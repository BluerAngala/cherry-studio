/**
 * AI 回答质量审查触发服务
 * 在消息完成时自动触发审查流程
 */

import { loggerService } from '@logger'
import type { Assistant } from '@renderer/types'
import type { Message } from '@renderer/types/newMessage'
import { MessageBlockType } from '@renderer/types/newMessage'
import { createReviewBlock } from '@renderer/utils/messageUtils/create'
import { getMainTextContent } from '@renderer/utils/messageUtils/find'

import store from '../../store'
import { removeOneBlock, updateOneBlock, upsertOneBlock } from '../../store/messageBlock'
import { newMessagesActions } from '../../store/newMessage'
import { reviewResponse } from '../ResponseReviewService'

const logger = loggerService.withContext('ReviewTriggerService')

/**
 * 是否为需要审查的消息
 * 只审查助手消息且内容长度大于一定阈值
 */
function shouldReviewMessage(message: Message): boolean {
  // 只审查助手消息
  if (message.role !== 'assistant') {
    return false
  }

  // 检查是否已经存在审查块
  const state = store.getState()
  const messageBlocks = message.blocks.map((blockId) => state.messageBlocks.entities[blockId]).filter(Boolean)

  const hasExistingReview = messageBlocks.some((block) => block.type === MessageBlockType.REVIEW)
  if (hasExistingReview) {
    return false
  }

  // 获取内容长度
  const content = getMainTextContent(message)

  // 内容太短不需要审查
  if (content.length < 50) {
    return false
  }

  // 检查全局设置是否启用自动审查
  if (!state.settings.enableAutoQualityReview) {
    return false
  }

  // 检查助手设置是否启用审查
  // TODO: 添加助手级别的审查开关

  return true
}

/**
 * 触发消息审查
 * @param message 要审查的消息
 * @param assistant 助手配置
 * @param userQuery 用户问题
 */
export async function triggerMessageReview(message: Message, assistant: Assistant, userQuery: string): Promise<void> {
  try {
    if (!shouldReviewMessage(message)) {
      return
    }

    logger.info('Starting message review', { messageId: message.id })

    const content = getMainTextContent(message)

    // 调用审查服务
    const reviewResult = await reviewResponse({
      userQuery,
      assistantResponse: content,
      assistant
    })

    if (!reviewResult) {
      logger.warn('Review returned null result')
      return
    }

    // 创建审查块
    const reviewBlock = createReviewBlock(message.id, reviewResult)

    // 添加到 store
    store.dispatch(upsertOneBlock(reviewBlock))

    // 更新消息的 blocks 数组
    const updatedBlocks = [...message.blocks, reviewBlock.id]
    store.dispatch(
      newMessagesActions.updateMessage({
        topicId: message.topicId,
        messageId: message.id,
        updates: { blocks: updatedBlocks }
      })
    )

    logger.info('Message review completed', {
      messageId: message.id,
      overallScore: reviewResult.overallScore,
      passed: reviewResult.passed
    })
  } catch (error) {
    logger.error('Error triggering message review:', error as Error)
  }
}

/**
 * 手动触发消息审查
 * @param message 要审查的消息
 * @param assistant 助手配置
 * @param userQuery 用户问题
 */
export async function manualTriggerMessageReview(
  message: Message,
  assistant: Assistant,
  userQuery: string
): Promise<void> {
  try {
    // 手动触发只需要检查是否已经是助手消息
    if (message.role !== 'assistant') {
      return
    }

    // 检查是否已经存在审查块
    const state = store.getState()
    const messageBlocks = message.blocks.map((blockId) => state.messageBlocks.entities[blockId]).filter(Boolean)
    const hasExistingReview = messageBlocks.some((block) => block.type === MessageBlockType.REVIEW)

    if (hasExistingReview) {
      window.toast.info('该消息已经进行过质量审查')
      return
    }

    logger.info('Starting manual message review', { messageId: message.id })

    const content = getMainTextContent(message)

    // 调用审查服务
    const reviewResult = await reviewResponse({
      userQuery,
      assistantResponse: content,
      assistant
    })

    if (!reviewResult) {
      logger.warn('Review returned null result')
      return
    }

    // 创建审查块
    const reviewBlock = createReviewBlock(message.id, reviewResult)

    // 添加到 store
    store.dispatch(upsertOneBlock(reviewBlock))

    // 更新消息的 blocks 数组
    const updatedBlocks = [...message.blocks, reviewBlock.id]
    store.dispatch(
      newMessagesActions.updateMessage({
        topicId: message.topicId,
        messageId: message.id,
        updates: { blocks: updatedBlocks }
      })
    )

    logger.info('Manual message review completed', {
      messageId: message.id,
      overallScore: reviewResult.overallScore,
      passed: reviewResult.passed
    })
  } catch (error) {
    logger.error('Failed to trigger manual message review', error as Error)
    window.toast.error('质量审查失败，请稍后重试')
  }
}

/**
 * 更新审查块的用户反馈
 * @param blockId 审查块 ID
 * @param feedback 用户反馈
 */
export function updateReviewFeedback(blockId: string, feedback: string): void {
  try {
    store.dispatch(
      updateOneBlock({
        id: blockId,
        changes: { userFeedback: feedback }
      })
    )
  } catch (error) {
    logger.error('Error updating review feedback:', error as Error)
  }
}

/**
 * 设置审查块为重新生成状态
 * @param blockId 审查块 ID
 */
export function setReviewRegenerating(blockId: string): void {
  try {
    store.dispatch(
      updateOneBlock({
        id: blockId,
        changes: { isRegenerating: true }
      })
    )
  } catch (error) {
    logger.error('Error setting review regenerating:', error as Error)
  }
}

/**
 * 更新审查块折叠状态
 * @param blockId 审查块 ID
 * @param isFolded 是否折叠
 */
export function updateReviewBlockFolded(blockId: string, isFolded: boolean): void {
  try {
    store.dispatch(
      updateOneBlock({
        id: blockId,
        changes: { isFolded }
      })
    )
  } catch (error) {
    logger.error('Error updating review block folded:', error as Error)
  }
}

/**
 * 更新用户认可的改进建议
 * @param blockId 审查块 ID
 * @param likedSuggestions 认可的改进建议索引数组
 */
export function updateLikedSuggestions(blockId: string, likedSuggestions: number[]): void {
  try {
    store.dispatch(
      updateOneBlock({
        id: blockId,
        changes: { likedSuggestions }
      })
    )
  } catch (error) {
    logger.error('Error updating liked suggestions:', error as Error)
  }
}

/**
 * 移除消息的审查块
 * @param messageId 消息 ID
 */
export function removeReviewBlock(messageId: string): void {
  try {
    const state = store.getState()
    const message = state.messages.entities[messageId]
    if (!message) return

    const reviewBlockId = message.blocks.find((blockId) => {
      const block = state.messageBlocks.entities[blockId]
      return block?.type === MessageBlockType.REVIEW
    })

    if (reviewBlockId) {
      // 从消息中移除块引用
      const updatedBlocks = message.blocks.filter((id) => id !== reviewBlockId)
      store.dispatch(
        newMessagesActions.updateMessage({
          topicId: message.topicId,
          messageId,
          updates: { blocks: updatedBlocks }
        })
      )

      // 删除块
      store.dispatch(removeOneBlock(reviewBlockId))
    }
  } catch (error) {
    logger.error('Error removing review block:', error as Error)
  }
}
