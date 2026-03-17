import { loggerService } from '@logger'
import { IpcChannel } from '@shared/IpcChannel'
import { BrowserWindow, ipcMain } from 'electron'
import { eq } from 'drizzle-orm'
import { DatabaseManager } from './agents/database/DatabaseManager'
import * as schema from './agents/database/schema'

const logger = loggerService.withContext('MigrationV2Service')

export interface MigrationData {
  settings?: any[]
  llmProviders?: any[]
  files?: any[]
  knowledgeNotes?: any[]
  translateHistory?: any[]
  translateLanguages?: any[]
  sessions?: any[]
  messages?: any[]
}

export class MigrationV2Service {
  private static instance: MigrationV2Service
  private isMigrating = false
  private progress = 0

  private constructor() {}

  public static getInstance(): MigrationV2Service {
    if (!MigrationV2Service.instance) {
      MigrationV2Service.instance = new MigrationV2Service()
    }
    return MigrationV2Service.instance
  }

  public registerIpcHandler(): void {
    ipcMain.handle(IpcChannel.MigrationV2_Start, async (_event, data: MigrationData) => {
      if (this.isMigrating) return { success: false, message: 'Migration already in progress' }
      
      this.isMigrating = true
      this.progress = 0
      
      try {
        await this.performMigration(data)
        return { success: true }
      } catch (error) {
        logger.error('Migration V2 failed:', error as Error)
        return { success: false, error: (error as Error).message }
      } finally {
        this.isMigrating = false
      }
    })

    ipcMain.handle(IpcChannel.MigrationV2_GetStatus, () => {
      return { isMigrating: this.isMigrating, progress: this.progress }
    })
  }

  private async performMigration(data: MigrationData): Promise<void> {
    const dbManager = await DatabaseManager.getInstance()
    const db = dbManager.getDatabase()
    
    logger.info('Starting Phase 0 migration to LibSQL...')

    // 1. Migrate Settings
    if (data.settings?.length) {
      logger.info(`Migrating ${data.settings.length} settings...`)
      for (const setting of data.settings) {
        await db.insert(schema.settingsTable).values({
          id: setting.id,
          value: JSON.stringify(setting.value),
          updated_at: new Date().toISOString()
        }).onConflictDoUpdate({
          target: schema.settingsTable.id,
          set: { value: JSON.stringify(setting.value), updated_at: new Date().toISOString() }
        })
      }
    }

    // 2. Migrate LLM Providers
    if (data.llmProviders?.length) {
      logger.info(`Migrating ${data.llmProviders.length} LLM providers...`)
      for (const provider of data.llmProviders) {
        await db.insert(schema.llmProvidersTable).values({
          id: provider.id,
          name: provider.name,
          api_key: provider.apiKey,
          api_host: provider.apiHost,
          enabled: provider.enabled,
          is_system: provider.isSystem,
          models: JSON.stringify(provider.models),
          config: JSON.stringify(provider.config || {}),
          order: provider.order || 0,
          created_at: provider.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString()
        }).onConflictDoUpdate({
          target: schema.llmProvidersTable.id,
          set: { 
            name: provider.name,
            api_key: provider.apiKey,
            api_host: provider.apiHost,
            enabled: provider.enabled,
            models: JSON.stringify(provider.models),
            updated_at: new Date().toISOString()
          }
        })
      }
    }

    // 3. Migrate Files
    if (data.files?.length) {
      logger.info(`Migrating ${data.files.length} files...`)
      for (const file of data.files) {
        await db.insert(schema.filesTable).values({
          id: file.id,
          name: file.name,
          origin_name: file.origin_name,
          path: file.path,
          size: file.size,
          ext: file.ext,
          type: file.type,
          count: file.count,
          created_at: file.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString()
        }).onConflictDoNothing()
      }
    }

    // 4. Migrate Knowledge Notes
    if (data.knowledgeNotes?.length) {
      logger.info(`Migrating ${data.knowledgeNotes.length} knowledge notes...`)
      for (const note of data.knowledgeNotes) {
        await db.insert(schema.knowledgeNotesTable).values({
          id: note.id,
          baseId: note.baseId,
          type: note.type,
          content: note.content,
          created_at: note.created_at || new Date().toISOString(),
          updated_at: note.updated_at || new Date().toISOString()
        }).onConflictDoNothing()
      }
    }

    // 5. Migrate Translate History
    if (data.translateHistory?.length) {
      logger.info(`Migrating ${data.translateHistory.length} translate history...`)
      for (const item of data.translateHistory) {
        await db.insert(schema.translateHistoryTable).values({
          id: item.id,
          sourceText: item.sourceText,
          targetText: item.targetText,
          sourceLanguage: item.sourceLanguage,
          targetLanguage: item.targetLanguage,
          created_at: item.createdAt || new Date().toISOString()
        }).onConflictDoNothing()
      }
    }

    logger.info('Migration V2 completed successfully.')
    this.notifyProgress(100)
  }

  private notifyProgress(progress: number): void {
    this.progress = progress
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send(IpcChannel.MigrationV2_Progress, progress)
    })
  }
}

export const migrationV2Service = MigrationV2Service.getInstance()
