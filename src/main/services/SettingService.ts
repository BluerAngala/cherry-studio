import { eq } from 'drizzle-orm'

import { DatabaseManager } from './agents/database/DatabaseManager'
import { settingsTable } from './agents/database/schema'
import StoreSyncService from './StoreSyncService'

export class SettingService {
  private static instance: SettingService

  private constructor() {}

  public static getInstance(): SettingService {
    if (!SettingService.instance) {
      SettingService.instance = new SettingService()
    }
    return SettingService.instance
  }

  async getSetting(id: string): Promise<any | null> {
    const db = (await DatabaseManager.getInstance()).getDatabase()
    const result = await db.select().from(settingsTable).where(eq(settingsTable.id, id)).limit(1)
    if (result.length === 0) return null
    return JSON.parse(result[0].value)
  }

  async setSetting(id: string, value: any): Promise<void> {
    const db = (await DatabaseManager.getInstance()).getDatabase()
    const valueStr = JSON.stringify(value)

    await db
      .insert(settingsTable)
      .values({
        id,
        value: valueStr,
        updated_at: new Date().toISOString()
      })
      .onConflictDoUpdate({
        target: settingsTable.id,
        set: { value: valueStr, updated_at: new Date().toISOString() }
      })

    // Broadcast update to all renderer windows
    // Note: We use app: prefix to match the Redux slice
    const reduxType = id.startsWith('app:') ? `settings/${id.replace('app:', '')}` : id
    StoreSyncService.syncToRenderer(reduxType, value)
  }

  async getAllSettings(): Promise<Record<string, any>> {
    const db = (await DatabaseManager.getInstance()).getDatabase()
    const rows = await db.select().from(settingsTable)
    const settings: Record<string, any> = {}
    rows.forEach((row) => {
      settings[row.id] = JSON.parse(row.value)
    })
    return settings
  }
}

export const settingService = SettingService.getInstance()
