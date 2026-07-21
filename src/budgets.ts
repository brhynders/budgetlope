import { useSyncExternalStore } from 'react'
import { nanoid } from 'nanoid'
import * as Y from 'yjs'
import { IndexeddbPersistence } from 'y-indexeddb'
import { api, ApiError, type ServerBudget } from './api'
import { isSignedIn, loadSyncSettings } from './syncSettings'

export interface BudgetMeta {
  id: string
  name: string
  /** Sync room registered to this account on the server; unset until registered. */
  room?: string
  /** Data originates on the server (joined via invite or another device) — skip first-run seeding. */
  joined?: boolean
}

const LIST_KEY = 'budgetlope.budgets'
const CURRENT_KEY = 'budgetlope.currentBudget'
const PENDING_DELETES_KEY = 'budgetlope.pendingRoomDeletes'

// ---------------------------------------------------------------------------
// Registry: a Y.Doc holding the budget list (id -> name) plus tombstones so
// deletions propagate. In legacy shared-token mode it syncs through one fixed
// room shared by all devices; signed-in accounts instead reconcile the list
// with the server's membership records (reconcileServerBudgets), and the
// registry doc stays a local (IndexedDB-only) cache. The localStorage list is
// a synchronous cache of it for boot-time reads.

export const REGISTRY_DOC_NAME = 'budgetlope-registry'
export const registryDoc = new Y.Doc()
const regBudgets = registryDoc.getMap<string>('budgets')
const regDeleted = registryDoc.getMap<boolean>('deleted')

const listeners = new Set<() => void>()
export function subscribeBudgets(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

let cached: BudgetMeta[] | null = null

export function loadBudgets(): BudgetMeta[] {
  if (cached) return cached
  try {
    const raw = localStorage.getItem(LIST_KEY)
    if (raw) {
      const list = JSON.parse(raw) as BudgetMeta[]
      if (Array.isArray(list) && list.length > 0) return (cached = list)
    }
  } catch {
    // fall through
  }
  // First run (or pre-multi-budget data): the legacy database becomes "My Budget"
  const initial = [{ id: 'default', name: 'My Budget' }]
  localStorage.setItem(LIST_KEY, JSON.stringify(initial))
  return (cached = initial)
}

function saveBudgets(list: BudgetMeta[]): void {
  cached = list
  localStorage.setItem(LIST_KEY, JSON.stringify(list))
  for (const fn of listeners) fn()
}

/** Reactive budget list — re-renders on local edits and on remote registry sync. */
export function useBudgets(): BudgetMeta[] {
  return useSyncExternalStore(subscribeBudgets, loadBudgets)
}

/** Rebuild the cached list from the registry: local order kept, new ids appended. */
function applyRegistry(): void {
  if (regBudgets.size === 0) return // registry not loaded yet; never wipe the cache
  const prev = loadBudgets()
  const list: BudgetMeta[] = []
  for (const b of prev) {
    const name = regBudgets.get(b.id)
    if (name !== undefined && !regDeleted.has(b.id)) {
      list.push(name === b.name ? b : { ...b, name })
    }
  }
  regBudgets.forEach((name, id) => {
    if (!regDeleted.has(id) && !list.some((b) => b.id === id)) list.push({ id, name })
  })
  if (list.length === 0) return
  if (list.length === prev.length && list.every((b, i) => b === prev[i])) return
  saveBudgets(list)
}

/**
 * Load the registry from IndexedDB and keep the localStorage cache in step
 * with it. Budgets known locally but missing from the registry (first run,
 * or a registry write lost to the post-create page reload) are re-added
 * unless tombstoned.
 */
export async function initBudgetRegistry(): Promise<void> {
  const persistence = new IndexeddbPersistence(REGISTRY_DOC_NAME, registryDoc)
  await persistence.whenSynced
  registryDoc.transact(() => {
    for (const b of loadBudgets()) {
      if (!regBudgets.has(b.id) && !regDeleted.has(b.id)) regBudgets.set(b.id, b.name)
    }
  })
  registryDoc.on('update', applyRegistry)
  applyRegistry()
}

export function currentBudget(): BudgetMeta {
  const list = loadBudgets()
  const id = localStorage.getItem(CURRENT_KEY)
  return list.find((b) => b.id === id) ?? list[0]
}

/** IndexedDB database name for a budget (also the sync room until one is registered). */
export function docNameFor(b: BudgetMeta): string {
  return b.id === 'default' ? 'budgetlope' : `budgetlope-${b.id}`
}

/** Server sync room for a budget. */
export function roomNameFor(b: BudgetMeta): string {
  return b.room ?? docNameFor(b)
}

export async function createBudget(name: string): Promise<BudgetMeta> {
  const b: BudgetMeta = { id: nanoid(8), name }
  const s = loadSyncSettings()
  if (isSignedIn(s) && s.enabled) {
    try {
      await api.registerBudget(s.url, s.token, docNameFor(b), name)
      b.room = docNameFor(b)
    } catch {
      // offline — the next reconcile adopts it
    }
  }
  saveBudgets([...loadBudgets(), b])
  regBudgets.set(b.id, name)
  return b
}

export function renameBudget(id: string, name: string): void {
  const target = loadBudgets().find((b) => b.id === id)
  saveBudgets(loadBudgets().map((b) => (b.id === id ? { ...b, name } : b)))
  regBudgets.set(id, name)
  const s = loadSyncSettings()
  if (target?.room && isSignedIn(s) && s.enabled) {
    void api.renameBudget(s.url, s.token, target.room, name).catch(() => {})
  }
}

// Rooms whose server-side leave hasn't gone through yet (offline deletes);
// retried and excluded from reconcile so the budget doesn't resurrect.
function loadPendingDeletes(): string[] {
  try {
    const raw = localStorage.getItem(PENDING_DELETES_KEY)
    if (raw) return JSON.parse(raw) as string[]
  } catch {
    // fall through
  }
  return []
}

function savePendingDeletes(rooms: string[]): void {
  localStorage.setItem(PENDING_DELETES_KEY, JSON.stringify(rooms))
}

async function flushPendingDeletes(): Promise<string[]> {
  const s = loadSyncSettings()
  let pending = loadPendingDeletes()
  if (!isSignedIn(s) || pending.length === 0) return pending
  for (const room of [...pending]) {
    try {
      await api.deleteBudget(s.url, s.token, room)
      pending = pending.filter((r) => r !== room)
    } catch (err) {
      // 403/404 = membership already gone; anything else retries next time
      if (err instanceof ApiError && (err.status === 403 || err.status === 404)) {
        pending = pending.filter((r) => r !== room)
      }
    }
  }
  savePendingDeletes(pending)
  return pending
}

/**
 * Remove a budget everywhere: this account leaves it on the server (the last
 * member out deletes its data there) and its local data is deleted on this
 * device. Only non-active budgets can be deleted (their database has no open
 * connection, so the delete cannot be blocked).
 */
export function deleteBudget(id: string): void {
  const list = loadBudgets()
  if (list.length <= 1) throw new Error('Cannot delete the only budget')
  if (id === currentBudget().id) throw new Error('Switch to another budget first')
  const target = list.find((b) => b.id === id)
  if (!target) return
  saveBudgets(list.filter((b) => b.id !== id))
  registryDoc.transact(() => {
    regBudgets.delete(id)
    regDeleted.set(id, true)
  })
  indexedDB.deleteDatabase(docNameFor(target))
  if (target.room && isSignedIn(loadSyncSettings())) {
    savePendingDeletes([...new Set([...loadPendingDeletes(), target.room])])
    void flushPendingDeletes()
  }
}

/** Drop a budget from the local list only (it disappeared from the server account). */
function dropLocal(b: BudgetMeta): void {
  registryDoc.transact(() => {
    regBudgets.delete(b.id)
    regDeleted.set(b.id, true)
  })
  indexedDB.deleteDatabase(docNameFor(b))
}

/**
 * Merge the account's server-side budget list into the local one:
 *  - budgets on the server but unknown here are added (created on another
 *    device, or shared by another user);
 *  - local budgets never registered are registered now ("adopted"), falling
 *    back to a fresh room id if their default room name is taken;
 *  - local budgets whose registration disappeared were deleted/left
 *    elsewhere and are removed here;
 *  - server names win for budgets known on both sides.
 * No-op when not signed in. Never throws.
 */
export async function reconcileServerBudgets(): Promise<void> {
  const s = loadSyncSettings()
  if (!isSignedIn(s) || !s.enabled) return
  const pending = await flushPendingDeletes()
  let server: ServerBudget[]
  try {
    server = await api.budgets(s.url, s.token)
  } catch {
    return
  }
  const byRoom = new Map(server.filter((sb) => !pending.includes(sb.room)).map((sb) => [sb.room, sb]))
  let list = [...loadBudgets()]
  const currentId = currentBudget().id

  // Registered locally but gone from the account — deleted or left elsewhere.
  // The open budget is spared mid-session; its sockets just stop authorizing.
  for (const b of list.filter((b) => b.room && !byRoom.has(b.room!) && b.id !== currentId)) {
    list = list.filter((x) => x.id !== b.id)
    dropLocal(b)
  }

  const matches = (b: BudgetMeta, room: string) =>
    b.room === room || (!b.room && docNameFor(b) === room)

  for (const sb of byRoom.values()) {
    if (!list.some((b) => matches(b, sb.room))) {
      const nb: BudgetMeta = { id: nanoid(8), name: sb.name, room: sb.room, joined: true }
      list.push(nb)
      regBudgets.set(nb.id, nb.name)
    }
  }

  for (let i = 0; i < list.length; i++) {
    const b = list[i]
    const sb = byRoom.get(roomNameFor(b))
    if (sb) {
      if (b.room !== sb.room || b.name !== sb.name) {
        list[i] = { ...b, room: sb.room, name: sb.name }
        regBudgets.set(b.id, sb.name)
      }
      continue
    }
    if (b.room) continue // still pending server-side removal, handled above
    try {
      await api.registerBudget(s.url, s.token, docNameFor(b), b.name)
      list[i] = { ...b, room: docNameFor(b) }
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Default room name claimed by another account — mint a private one
        const room = `bl-${nanoid(12)}`
        try {
          await api.registerBudget(s.url, s.token, room, b.name)
          list[i] = { ...b, room }
        } catch {
          // still offline; adopted on a later reconcile
        }
      }
    }
  }

  saveBudgets(list)
}

/** Redeem an invite code: joins on the server and adds the budget locally. */
export async function joinSharedBudget(code: string): Promise<BudgetMeta> {
  const s = loadSyncSettings()
  if (!isSignedIn(s)) throw new Error('Sign in to join a shared budget')
  const { room, name } = await api.join(s.url, s.token, code)
  const existing = loadBudgets().find((b) => b.room === room)
  if (existing) return existing
  const b: BudgetMeta = { id: nanoid(8), name, room, joined: true }
  saveBudgets([...loadBudgets(), b])
  regBudgets.set(b.id, name)
  return b
}

/** Create an invite code others can redeem to join this budget. */
export async function createInvite(b: BudgetMeta): Promise<string> {
  const s = loadSyncSettings()
  if (!isSignedIn(s) || !s.enabled) throw new Error('Sign in with sync enabled to share budgets')
  let room = b.room
  if (!room) {
    // Created offline and not yet registered — register it now
    await reconcileServerBudgets()
    room = loadBudgets().find((x) => x.id === b.id)?.room
    if (!room) throw new Error('Budget is not synced to the server yet')
  }
  const { code } = await api.createInvite(s.url, s.token, room)
  return code
}

/** Persist the choice and reload — the whole app boots against the new Y.Doc. */
export function switchBudget(id: string): void {
  localStorage.setItem(CURRENT_KEY, id)
  // Routes reference ids from the old budget; land on the budget screen
  location.hash = '#/budget'
  location.reload()
}
