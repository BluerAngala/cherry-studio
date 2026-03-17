import type { Provider } from '@types'
import { eq } from 'drizzle-orm'

import { DatabaseManager } from './agents/database/DatabaseManager'
import { llmProvidersTable } from './agents/database/schema'
import StoreSyncService from './StoreSyncService'

export class LlmProviderService {
  private static instance: LlmProviderService

  private constructor() {}

  public static getInstance(): LlmProviderService {
    if (!LlmProviderService.instance) {
      LlmProviderService.instance = new LlmProviderService()
    }
    return LlmProviderService.instance
  }

  async getProviders(): Promise<Provider[]> {
    const db = (await DatabaseManager.getInstance()).getDatabase()
    const rows = await db.select().from(llmProvidersTable).orderBy(llmProvidersTable.order)

    return rows.map((row) => {
      const config = row.config ? JSON.parse(row.config) : {}
      return {
        ...config,
        id: row.id,
        name: row.name,
        apiKey: row.api_key || '',
        apiHost: row.api_host || '',
        enabled: row.enabled,
        isSystem: row.is_system,
        models: row.models ? JSON.parse(row.models) : [],
        order: row.order
      }
    })
  }

  async updateProvider(id: string, data: Partial<Provider>, sync = true): Promise<void> {
    const db = (await DatabaseManager.getInstance()).getDatabase()

    // Get current provider data to preserve existing config
    const [currentRow] = await db.select().from(llmProvidersTable).where(eq(llmProvidersTable.id, id))
    const currentConfig = currentRow?.config ? JSON.parse(currentRow.config) : {}

    const updateData: any = {
      updated_at: new Date().toISOString()
    }

    const { name, apiKey, apiHost, enabled, models, order, isSystem, ...rest } = data

    if (name !== undefined) updateData.name = name
    if (apiKey !== undefined) updateData.api_key = apiKey
    if (apiHost !== undefined) updateData.api_host = apiHost
    if (enabled !== undefined) updateData.enabled = enabled
    if (isSystem !== undefined) updateData.is_system = isSystem
    if (models !== undefined) updateData.models = JSON.stringify(models)
    if (order !== undefined) updateData.order = order

    // Merge new extra fields into existing config
    const newConfig = { ...currentConfig, ...rest }
    updateData.config = JSON.stringify(newConfig)

    await db.update(llmProvidersTable).set(updateData).where(eq(llmProvidersTable.id, id))

    // Broadcast update to all renderer windows
    if (sync) {
      StoreSyncService.syncToRenderer('llm/updateProvider', { id, ...data })
    }
  }

  async addProvider(provider: Provider, sync = true): Promise<void> {
    const db = (await DatabaseManager.getInstance()).getDatabase()

    const { id, name, apiKey, apiHost, enabled, isSystem, models, order, ...rest } = provider

    await db.insert(llmProvidersTable).values({
      id,
      name,
      api_key: apiKey,
      api_host: apiHost,
      enabled: enabled ?? true,
      is_system: isSystem ?? false,
      models: JSON.stringify(models),
      config: JSON.stringify(rest),
      order: order || 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })

    if (sync) {
      StoreSyncService.syncToRenderer('llm/addProvider', provider)
    }
  }

  async removeProvider(id: string, sync = true): Promise<void> {
    const db = (await DatabaseManager.getInstance()).getDatabase()
    await db.delete(llmProvidersTable).where(eq(llmProvidersTable.id, id))

    if (sync) {
      StoreSyncService.syncToRenderer('llm/removeProvider', { id })
    }
  }
}
export const llmProviderService = LlmProviderService.getInstance()
