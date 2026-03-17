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
import { IpcChannel } from '@shared/IpcChannel'
import type { StoreSyncAction } from '@types'
import { BrowserWindow, ipcMain } from 'electron'
import { settingService } from './SettingService'
import { llmProviderService } from './LlmProviderService'

/**
 * StoreSyncService class manages Redux store synchronization between multiple windows in the main process
 * It uses singleton pattern to ensure only one sync service instance exists in the application
 */
export class StoreSyncService {
  private static instance: StoreSyncService
  private windowIds: number[] = []
  private isIpcHandlerRegistered = false

  private constructor() {
    return
  }

  /**
   * Get the singleton instance of StoreSyncService
   */
  public static getInstance(): StoreSyncService {
    if (!StoreSyncService.instance) {
      StoreSyncService.instance = new StoreSyncService()
    }
    return StoreSyncService.instance
  }

  /**
   * Subscribe a window to store sync
   */
  public subscribe(windowId: number): void {
    if (!this.windowIds.includes(windowId)) {
      this.windowIds.push(windowId)
    }
  }

  /**
   * Unsubscribe a window from store sync
   */
  public unsubscribe(windowId: number): void {
    this.windowIds = this.windowIds.filter((id) => id !== windowId)
  }

  /**
   * Sync an action to all renderer windows
   */
  public syncToRenderer(type: string, payload: any): void {
    const action: StoreSyncAction = {
      type,
      payload
    }

    // -1 means the action is from the main process
    this.broadcastToOtherWindows(-1, action)
  }

  /**
   * Register IPC handlers for store sync communication
   */
  public registerIpcHandler(): void {
    if (this.isIpcHandlerRegistered) return

    ipcMain.handle(IpcChannel.StoreSync_Subscribe, (event) => {
      const windowId = BrowserWindow.fromWebContents(event.sender)?.id
      if (windowId) {
        this.subscribe(windowId)
      }
    })

    ipcMain.handle(IpcChannel.StoreSync_Unsubscribe, (event) => {
      const windowId = BrowserWindow.fromWebContents(event.sender)?.id
      if (windowId) {
        this.unsubscribe(windowId)
      }
    })

    ipcMain.handle(IpcChannel.StoreSync_OnUpdate, async (event, action: StoreSyncAction) => {
      const sourceWindowId = BrowserWindow.fromWebContents(event.sender)?.id

      if (!sourceWindowId) return

      // Persistent storage handling for specific slices
      await this.handlePersistence(action)

      // Broadcast the action to all other windows
      this.broadcastToOtherWindows(sourceWindowId, action)
    })

    ipcMain.handle(IpcChannel.StoreSync_GetInitialState, async () => {
      const settings = await settingService.getAllSettings()
      const providers = await llmProviderService.getProviders()
      
      return {
        settings,
        llm: { providers }
      }
    })

    this.isIpcHandlerRegistered = true
  }

  /**
   * Handle persistence for incoming actions
   */
  private async handlePersistence(action: StoreSyncAction): Promise<void> {
    const { type, payload } = action

    // Handle Settings
    if (type.startsWith('settings/')) {
      const settingKey = type.replace('settings/', '')
      await settingService.setSetting(`app:${settingKey}`, payload)
    }

    // Handle LLM Providers
    if (type.startsWith('llm/')) {
      const actionType = type.replace('llm/', '')
      switch (actionType) {
        case 'updateProvider':
          await llmProviderService.updateProvider(payload.id, payload, false)
          break
        case 'addProvider':
          await llmProviderService.addProvider(payload, false)
          break
        case 'removeProvider':
          await llmProviderService.removeProvider(payload.id, false)
          break
      }
    }
  }

  /**
   * Broadcast a Redux action to all other windows except the source
   */
  private broadcastToOtherWindows(sourceWindowId: number, action: StoreSyncAction): void {
    const syncAction = {
      ...action,
      meta: {
        ...action.meta,
        fromSync: true,
        source: sourceWindowId === -1 ? 'main' : `windowId:${sourceWindowId}`
      }
    }

    this.windowIds.forEach((windowId) => {
      if (windowId !== sourceWindowId) {
        const targetWindow = BrowserWindow.fromId(windowId)
        if (targetWindow && !targetWindow.isDestroyed()) {
          targetWindow.webContents.send(IpcChannel.StoreSync_BroadcastSync, syncAction)
        } else {
          this.unsubscribe(windowId)
        }
      }
    })
  }
}

export default StoreSyncService.getInstance()
