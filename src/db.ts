import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import {
  currentBudget,
  reconcileServerBudgets,
  REGISTRY_DOC_NAME,
  registryDoc,
  roomNameFor,
} from './budgets'
import { isSignedIn, loadSyncSettings, saveSyncSettings, type SyncSettings } from './syncSettings'
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
// Sync via the y-websocket protocol (see worker.js for the server)

export { loadSyncSettings, saveSyncSettings, isSignedIn }
export type { SyncSettings }

export type SyncStatus = 'off' | 'connecting' | 'active' | 'error'

let activeProvider: WebsocketProvider | null = null
let registryProvider: WebsocketProvider | null = null
let syncAttempt = 0

export function startSync(
  settings: SyncSettings,
  onStatus: (status: SyncStatus, detail?: string) => void,
): void {
  stopSync()
  const attempt = syncAttempt
  if (!settings.enabled || !settings.url) {
    onStatus('off')
    return
  }
  onStatus('connecting')

  const connect = () => {
    if (attempt !== syncAttempt) return // superseded by a newer start/stop
    const base = settings.url.replace(/\/+$/, '')
    const params: Record<string, string> = settings.token ? { token: settings.token } : {}
    let provider: WebsocketProvider
    try {
      provider = new WebsocketProvider(base, roomNameFor(currentBudget()), ydoc, { params })
      if (!isSignedIn(settings)) {
        // Legacy shared-token mode: the budget list syncs in one fixed room.
        // Signed-in accounts get their list from the server (reconcile) instead.
        registryProvider = new WebsocketProvider(base, REGISTRY_DOC_NAME, registryDoc, { params })
      }
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
        onStatus(
          'error',
          settings.userId ? 'auth failed — sign in again' : 'auth failed: invalid token',
        )
        provider.disconnect()
      }
    })
    activeProvider = provider
  }

  if (isSignedIn(settings)) {
    // Register/refresh the budget list first, so the server sees this account
    // as a member of the room the websocket is about to open
    void reconcileServerBudgets().finally(connect)
  } else {
    connect()
  }
}

export function stopSync(): void {
  syncAttempt++
  if (activeProvider) {
    activeProvider.destroy()
    activeProvider = null
  }
  if (registryProvider) {
    registryProvider.destroy()
    registryProvider = null
  }
}
