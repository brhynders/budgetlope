import { snapshotDocs, transactLocal, upsertRecord } from './db'
import type { AnyDoc } from './types'

export async function exportBackup(): Promise<void> {
  const docs = Object.values(snapshotDocs())
  const blob = new Blob([JSON.stringify({ app: 'budgetlope', version: 1, docs }, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `budgetlope-backup-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Merges docs from a backup file (this app's, or one exported by the earlier
 * PouchDB version — `_rev` is ignored) into the local data.
 */
export async function importBackup(file: File): Promise<number> {
  const parsed = JSON.parse(await file.text()) as { app?: string; docs?: AnyDoc[] }
  if (parsed.app !== 'budgetlope' || !Array.isArray(parsed.docs)) {
    throw new Error('Not a Budgetlope backup file')
  }
  const docs = parsed.docs
  transactLocal(() => {
    for (const doc of docs) {
      const { _id, ...fields } = doc as AnyDoc & { _rev?: string }
      delete fields._rev
      upsertRecord(_id, fields)
    }
  })
  return docs.length
}
