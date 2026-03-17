import { loggerService } from '@logger'
import { convertToBase64 } from '@renderer/utils'
import { IpcChannel } from '@shared/IpcChannel'


const logger = loggerService.withContext('ImageStorage')

const IMAGE_PREFIX = 'image://'

export default class ImageStorage {
  static async set(key: string, value: File | string) {
    const id = IMAGE_PREFIX + key
    try {
      if (typeof value === 'string') {
          // string（emoji）
          const existing = await window.electron.ipcRenderer.invoke(IpcChannel.Config_Get, id)
          if (existing) {
            window.electron.ipcRenderer.invoke(IpcChannel.Config_Set, { id, value })
            return
          }
          await window.electron.ipcRenderer.invoke(IpcChannel.Config_Set, { id, value })
        } else {
        // file image
        const base64Image = await convertToBase64(value)
          if (typeof base64Image === 'string') {
            const existing = await window.electron.ipcRenderer.invoke(IpcChannel.Config_Get, id)
            if (existing) {
              window.electron.ipcRenderer.invoke(IpcChannel.Config_Set, { id, value: base64Image })
              return
            }
            await window.electron.ipcRenderer.invoke(IpcChannel.Config_Set, { id, value: base64Image })
          }
        }
    } catch (error) {
      logger.error('Error storing the image', error as Error)
    }
  }

  static async get(key: string): Promise<string> {
    const id = IMAGE_PREFIX + key
    const res = await window.electron.ipcRenderer.invoke(IpcChannel.Config_Get, id)
    return res?.value
  }

  static async remove(key: string): Promise<void> {
    try {
      const id = IMAGE_PREFIX + key
      const record = await window.electron.ipcRenderer.invoke(IpcChannel.Config_Get, id)
      if (record) {
        // TODO: Add Config_Delete IPC channel if needed
        // For now, set value to null to mark as deleted
        await window.electron.ipcRenderer.invoke(IpcChannel.Config_Set, { id, value: null })
      }
    } catch (error) {
      logger.error('Error removing the image', error as Error)
      throw error
    }
  }
}
