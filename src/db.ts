import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { currentBudget, docNameFor } from './budgets'
import type { AnyDoc } from './types'

export const ydoc = new Y.Doc()

/** id prefix -> top-level Y.Map. Each record is a nested Y.Map keyed by field. */
export const collections = {
  'acct:': ydoc.getMap<Y.Map<unknown>>('accounts'),
  'grp:': ydoc.getMap<Y.Map<unknown>>('groups'),
  'cat:': ydoc.getMap<Y.Map<unknown>>('categories'),
  'txn:': ydoc.getMap<Y.Map<unknown>>('txns'),
  'alloc:': ydoc.getMap<Y.Map<unknown>>('allocs'),
} as const

function collectionOf(id: string): Y.Map<Y.Map<unknown>> {
  for (const [prefix, coll] of Object.entries(collections)) {
    if (id.startsWith(prefix)) return coll
  }
  throw new Error(`Unknown id prefix: ${id}`)
}

/**
 * Create or patch a record. Field values are written individually so
 * concurrent edits to different fields of the same record merge cleanly.
 * `undefined` deletes the field.
 */
export function upsertRecord(id: string, fields: Record<string, unknown>): void {
  ydoc.transact(() => {
    const coll = collectionOf(id)
    let rec = coll.get(id)
    if (!rec) {
      rec = new Y.Map()
      coll.set(id, rec)
    }
    for (const [k, v] of Object.entries(fields)) {
      if (k === '_id') continue
      if (v === undefined) {
        if (rec.has(k)) rec.delete(k)
      } else if (rec.get(k) !== v) {
        rec.set(k, v)
      }
    }
  })
}

export function removeRecord(id: string): void {
  ydoc.transact(() => {
    collectionOf(id).delete(id)
  })
}

/** Run several record writes as one atomic step. */
export function transactLocal(fn: () => void): void {
  ydoc.transact(fn)
}

export function getRecord<T extends AnyDoc>(id: string): T | null {
  const rec = collectionOf(id).get(id)
  if (!rec) return null
  return { _id: id, ...(rec.toJSON() as object) } as T
}

export function snapshotDocs(): Record<string, AnyDoc> {
  const out: Record<string, AnyDoc> = {}
  for (const coll of Object.values(collections)) {
    coll.forEach((rec, id) => {
      out[id] = { _id: id, ...(rec.toJSON() as object) } as AnyDoc
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// Sync via Hocuspocus (see server/ for a ready-to-run instance)

export interface SyncSettings {
  url: string
  token: string
  enabled: boolean
}

const SYNC_KEY = 'budgetlope.sync'

export function loadSyncSettings(): SyncSettings {
  try {
    const raw = localStorage.getItem(SYNC_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SyncSettings>
      return { url: parsed.url ?? '', token: parsed.token ?? '', enabled: !!parsed.enabled }
    }
  } catch {
    // fall through to defaults
  }
  return { url: '', token: '', enabled: false }
}

export function saveSyncSettings(s: SyncSettings): void {
  localStorage.setItem(SYNC_KEY, JSON.stringify(s))
}

export type SyncStatus = 'off' | 'connecting' | 'active' | 'error'

let activeProvider: WebsocketProvider | null = null

export function startSync(
  settings: SyncSettings,
  onStatus: (status: SyncStatus, detail?: string) => void,
): void {
  stopSync()
  if (!settings.enabled || !settings.url) {
    onStatus('off')
    return
  }
  onStatus('connecting')
  let provider: WebsocketProvider
  try {
    provider = new WebsocketProvider(
      settings.url.replace(/\/+$/, ''),
      docNameFor(currentBudget()),
      ydoc,
      { params: settings.token ? { token: settings.token } : {} },
    )
  } catch (err) {
    onStatus('error', String(err))
    return
  }
  let authFailed = false
  provider.on('status', ({ status }: { status: string }) => {
    if (authFailed) return
    if (status === 'connected') onStatus('active')
    else if (status === 'connecting') onStatus('connecting')
    else onStatus('connecting', 'disconnected — retrying')
  })
  provider.on('sync', (isSynced: boolean) => {
    if (isSynced && !authFailed) onStatus('active')
  })
  // Servers close with 4401 on a bad token — stop retrying and surface it
  provider.on('connection-close', (event: CloseEvent | null) => {
    if (event && event.code === 4401) {
      authFailed = true
      onStatus('error', 'auth failed: invalid token')
      provider.disconnect()
    }
  })
  activeProvider = provider
}

export function stopSync(): void {
  if (activeProvider) {
    activeProvider.destroy()
    activeProvider = null
  }
}
