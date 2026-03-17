import { loggerService } from '@logger'
import { IpcChannel } from '@shared/IpcChannel'

import type { RootState } from '../store'

const logger = loggerService.withContext('MigrationV2Service')

export class MigrationV2Service {
  private static instance: MigrationV2Service

  private constructor() {}

  public static getInstance(): MigrationV2Service {
    if (!MigrationV2Service.instance) {
      MigrationV2Service.instance = new MigrationV2Service()
    }
    return MigrationV2Service.instance
  }

  public async startMigration(state: RootState): Promise<boolean> {
    try {
      logger.info('Gathering data for Phase 0 migration...')

      const migrationData = {
        settings: this.gatherSettings(state),
        llmProviders: this.gatherLlmProviders(state),
        files: await this.gatherFiles(),
        knowledgeNotes: await this.gatherKnowledgeNotes(),
        translateHistory: await this.gatherTranslateHistory()
      }

      logger.info('Sending data to main process for LibSQL insertion...')
      const result = await window.electron.ipcRenderer.invoke(IpcChannel.MigrationV2_Start, migrationData)

      if (result.success) {
        logger.info('Migration Phase 0 completed successfully.')
        return true
      } else {
        logger.error('Migration Phase 0 failed:', result.error)
        return false
      }
    } catch (error) {
      logger.error('Error during migration gathering:', error as Error)
      return false
    }
  }

  private gatherSettings(state: RootState) {
    // Map Redux settings to setting rows
    const settings: any[] = []
    const settingsSlice = state.settings

    Object.entries(settingsSlice).forEach(([key, value]) => {
      settings.push({ id: `app:${key}`, value })
    })

    return settings
  }

  private gatherLlmProviders(state: RootState) {
    return state.llm.providers
  }

  private async gatherFiles() {
    // return await db.table('files').toArray()
    return []
  }

  private async gatherKnowledgeNotes() {
    // return await db.table('knowledge_notes').toArray()
    return []
  }

  private async gatherTranslateHistory() {
    // return await db.table('translate_history').toArray()
    return []
  }
}

export const migrationV2Service = MigrationV2Service.getInstance()
