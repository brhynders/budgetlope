import { create } from 'zustand'
import { IndexeddbPersistence } from 'y-indexeddb'
import { currentBudget, docNameFor, initBudgetRegistry } from './budgets'
import {
  collections,
  loadSyncSettings,
  snapshotDocs,
  startSync,
  ydoc,
  type SyncStatus,
} from './db'
import { seedDefaults } from './seed'
import {
  isAccount,
  isAlloc,
  isCategory,
  isGroup,
  isTxn,
  type AccountDoc,
  type AllocDoc,
  type AnyDoc,
  type CategoryDoc,
  type GroupDoc,
  type TxnDoc,
} from './types'

interface StoreState {
  ready: boolean
  docs: Record<string, AnyDoc>
  syncStatus: SyncStatus
  syncDetail?: string
}

export const useStore = create<StoreState>(() => ({
  ready: false,
  docs: {},
  syncStatus: 'off',
}))

export function setSyncStatus(status: SyncStatus, detail?: string): void {
  useStore.setState({ syncStatus: status, syncDetail: detail })
}

let initialized = false

export async function initApp(): Promise<void> {
  if (initialized) return
  initialized = true

  const persistence = new IndexeddbPersistence(docNameFor(currentBudget()), ydoc)
  await Promise.all([persistence.whenSynced, initBudgetRegistry()])

  // Joined budgets start empty locally until the first sync delivers the
  // shared data — seeding would inject default categories into it
  if (collections['grp:'].size === 0 && !currentBudget().joined) seedDefaults()

  useStore.setState({ docs: snapshotDocs(), ready: true })

  // Coalesce bursts of updates (transactions, sync batches) into one snapshot
  let scheduled = false
  ydoc.on('update', () => {
    if (scheduled) return
    scheduled = true
    queueMicrotask(() => {
      scheduled = false
      useStore.setState({ docs: snapshotDocs() })
    })
  })

  startSync(loadSyncSettings(), setSyncStatus)
}

// ---------------------------------------------------------------------------
// Derived data, memoized on the docs object identity

export interface Data {
  docs: Record<string, AnyDoc>
  accounts: AccountDoc[]
  accountsById: Record<string, AccountDoc>
  groups: GroupDoc[]
  categories: CategoryDoc[]
  categoriesById: Record<string, CategoryDoc>
  categoriesByGroup: Record<string, CategoryDoc[]>
  /** credit account id -> its payment category */
  paymentCatByAccount: Record<string, CategoryDoc>
  txns: TxnDoc[]
  txnsById: Record<string, TxnDoc>
  allocs: AllocDoc[]
}

let cacheKey: Record<string, AnyDoc> | null = null
let cacheVal: Data | null = null

const bySort = (a: { sort: number }, b: { sort: number }) => a.sort - b.sort

export function deriveData(docs: Record<string, AnyDoc>): Data {
  if (cacheKey === docs && cacheVal) return cacheVal
  const all = Object.values(docs)
  const accounts = all.filter(isAccount).sort(bySort)
  const groups = all.filter(isGroup).sort(bySort)
  const categories = all.filter(isCategory).sort(bySort)
  const txns = all
    .filter(isTxn)
    .sort((a, b) => (a.date === b.date ? (a._id < b._id ? 1 : -1) : a.date < b.date ? 1 : -1))
  const allocs = all.filter(isAlloc)

  const accountsById: Record<string, AccountDoc> = {}
  for (const a of accounts) accountsById[a._id] = a
  const categoriesById: Record<string, CategoryDoc> = {}
  const categoriesByGroup: Record<string, CategoryDoc[]> = {}
  const paymentCatByAccount: Record<string, CategoryDoc> = {}
  for (const c of categories) {
    categoriesById[c._id] = c
    ;(categoriesByGroup[c.groupId] ??= []).push(c)
    if (c.ccAccountId) paymentCatByAccount[c.ccAccountId] = c
  }
  const txnsById: Record<string, TxnDoc> = {}
  for (const t of txns) txnsById[t._id] = t

  cacheKey = docs
  cacheVal = {
    docs,
    accounts,
    accountsById,
    groups,
    categories,
    categoriesById,
    categoriesByGroup,
    paymentCatByAccount,
    txns,
    txnsById,
    allocs,
  }
  return cacheVal
}

export function useData(): Data {
  const docs = useStore((s) => s.docs)
  return deriveData(docs)
}
