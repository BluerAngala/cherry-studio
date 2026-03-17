import { loggerService } from '@logger'
import { DatabaseManager } from './agents/database/DatabaseManager'
import { filesTable } from './agents/database/schema'
import { eq } from 'drizzle-orm'
import type { FileMetadata } from '@types'

const logger = loggerService.withContext('FileMetadataService')

export class FileMetadataService {
  private static instance: FileMetadataService

  private constructor() {}

  public static getInstance(): FileMetadataService {
    if (!FileMetadataService.instance) {
      FileMetadataService.instance = new FileMetadataService()
    }
    return FileMetadataService.instance
  }

  async getFiles(): Promise<FileMetadata[]> {
    const db = (await DatabaseManager.getInstance()).getDatabase()
    const rows = await db.select().from(filesTable).orderBy(filesTable.created_at)
    
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      origin_name: row.origin_name || '',
      path: row.path,
      size: row.size,
      ext: row.ext || '',
      type: row.type || '',
      count: row.count || 0,
      created_at: row.created_at
    }))
  }

  async addFile(file: FileMetadata): Promise<void> {
    const db = (await DatabaseManager.getInstance()).getDatabase()
    
    await db.insert(filesTable).values({
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

  async deleteFile(id: string): Promise<void> {
    const db = (await DatabaseManager.getInstance()).getDatabase()
    await db.delete(filesTable).where(eq(filesTable.id, id))
  }

  async updateFileCount(id: string, count: number): Promise<void> {
    const db = (await DatabaseManager.getInstance()).getDatabase()
    await db.update(filesTable)
      .set({ count, updated_at: new Date().toISOString() })
      .where(eq(filesTable.id, id))
  }
}

export const fileMetadataService = FileMetadataService.getInstance()
