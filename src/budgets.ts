import { useSyncExternalStore } from 'react'
import { nanoid } from 'nanoid'
import * as Y from 'yjs'
import { IndexeddbPersistence } from 'y-indexeddb'

export interface BudgetMeta {
  id: string
  name: string
}

const LIST_KEY = 'budgetlope.budgets'
const CURRENT_KEY = 'budgetlope.currentBudget'

// ---------------------------------------------------------------------------
// Registry: a Y.Doc shared by all devices through one fixed sync room, holding
// the budget list (id -> name) plus tombstones so deletions propagate. The
// localStorage list is kept as a synchronous cache of it for boot-time reads.

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
      list.push(name === b.name ? b : { id: b.id, name })
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

/** IndexedDB database name and sync document name for a budget. */
export function docNameFor(b: BudgetMeta): string {
  return b.id === 'default' ? 'budgetlope' : `budgetlope-${b.id}`
}

export function createBudget(name: string): BudgetMeta {
  const b: BudgetMeta = { id: nanoid(8), name }
  saveBudgets([...loadBudgets(), b])
  regBudgets.set(b.id, name)
  return b
}

export function renameBudget(id: string, name: string): void {
  saveBudgets(loadBudgets().map((b) => (b.id === id ? { ...b, name } : b)))
  regBudgets.set(id, name)
}

/**
 * Remove a budget everywhere: it leaves the synced registry (so other devices
 * drop it from their lists) and its local data is deleted on this device.
 * Only non-active budgets can be deleted (their database has no open
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
}

/** Persist the choice and reload — the whole app boots against the new Y.Doc. */
export function switchBudget(id: string): void {
  localStorage.setItem(CURRENT_KEY, id)
  // Routes reference ids from the old budget; land on the budget screen
  location.hash = '#/budget'
  location.reload()
}
