import KeyvStorage from '@kangfenmao/keyv-storage'

import { startAutoSync } from './services/BackupService'
import { startNutstoreAutoSync } from './services/NutstoreService'
import storeSyncService from './services/StoreSyncService'
import { webTraceService } from './services/WebTraceService'
import { migrationV2Service } from './services/MigrationV2Service'
import store from './store'

function initMigrationV2() {
  // Wait for store to be rehydrated and then start migration
  // We use a small delay to ensure everything is settled
  setTimeout(async () => {
    const isMigrated = localStorage.getItem('cherry_v2_migrated')
    if (!isMigrated) {
      const success = await migrationV2Service.startMigration(store.getState())
      if (success) {
        localStorage.setItem('cherry_v2_migrated', 'true')
      }
    }
  }, 2000)
}

function initKeyv() {
  window.keyv = new KeyvStorage()
  window.keyv.init()
}

function initAutoSync() {
  setTimeout(() => {
    const { webdavAutoSync, localBackupAutoSync, s3 } = store.getState().settings
    const { nutstoreAutoSync } = store.getState().nutstore
    if (webdavAutoSync || (s3 && s3.autoSync) || localBackupAutoSync) {
      startAutoSync()
    }
    if (nutstoreAutoSync) {
      startNutstoreAutoSync()
    }
  }, 8000)
}

function initStoreSync() {
  storeSyncService.subscribe()
}

function initWebTrace() {
  webTraceService.init()
}

initKeyv()
initAutoSync()
initStoreSync()
initWebTrace()
initMigrationV2()
