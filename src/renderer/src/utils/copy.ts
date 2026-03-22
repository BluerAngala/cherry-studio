import type { Message, Topic } from '@renderer/types'
import i18next from 'i18next'

import { writeTextToClipboard } from './clipboard'
import { messageToPlainText, topicToMarkdown, topicToPlainText } from './export'

export const copyTopicAsMarkdown = async (topic: Topic) => {
  const markdown = await topicToMarkdown(topic)
  await writeTextToClipboard(markdown)
  window.toast.success(i18next.t('message.copy.success'))
}

export const copyTopicAsPlainText = async (topic: Topic) => {
  const plainText = await topicToPlainText(topic)
  await writeTextToClipboard(plainText)
  window.toast.success(i18next.t('message.copy.success'))
}

export const copyMessageAsPlainText = async (message: Message) => {
  const plainText = messageToPlainText(message)
  await writeTextToClipboard(plainText)
  window.toast.success(i18next.t('message.copy.success'))
}
