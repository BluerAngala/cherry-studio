import { loggerService } from '@logger'

const logger = loggerService.withContext('Clipboard')

export async function writeTextToClipboard(text: string): Promise<void> {
  let browserClipboardError: Error | null = null

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch (error) {
      browserClipboardError = error as Error
      logger.warn('Browser clipboard write failed, falling back to Electron clipboard', browserClipboardError)
    }
  }

  const electronClipboardWriter = window.api?.selection?.writeToClipboard
  if (electronClipboardWriter) {
    const isWritten = await electronClipboardWriter(text)
    if (isWritten) {
      return
    }
  }

  throw browserClipboardError ?? new Error('Clipboard is unavailable')
}
