import dayjs from 'dayjs'
import { nanoid } from 'nanoid'
import { getRecord, removeRecord, transactLocal, upsertRecord } from './db'
import { deriveData, useStore } from './store'
import { CC_GROUP_ID, RTA, type AccountType, type TxnDoc } from './types'

const newId = (prefix: string) => `${prefix}:${nanoid(10)}`

const data = () => deriveData(useStore.getState().docs)

// ---------------------------------------------------------------------------
// Accounts

export async function createAccount(
  name: string,
  accountType: AccountType,
  startingBalance: number,
): Promise<string> {
  const d = data()
  const accountId = newId('acct')
  transactLocal(() => {
    upsertRecord(accountId, {
      type: 'account',
      name,
      accountType,
      sort: Math.max(-1, ...d.accounts.map((a) => a.sort)) + 1,
    })

    if (accountType === 'credit') {
      if (!getRecord(CC_GROUP_ID)) {
        upsertRecord(CC_GROUP_ID, { type: 'group', name: 'Credit Card Payments', sort: -1 })
      }
      upsertRecord(newId('cat'), {
        type: 'category',
        groupId: CC_GROUP_ID,
        name,
        sort: Math.max(-1, ...d.categories.map((c) => c.sort)) + 1,
        ccAccountId: accountId,
      })
    }

    if (startingBalance !== 0) {
      upsertRecord(newId('txn'), {
        type: 'txn',
        accountId,
        date: dayjs().format('YYYY-MM-DD'),
        payee: 'Starting Balance',
        // Cash starting balances are budgetable money; credit starting debt is not.
        categoryId: accountType === 'credit' ? null : RTA,
        memo: '',
        amount: startingBalance,
        cleared: true,
      })
    }
  })
  return accountId
}

export async function renameAccount(accountId: string, name: string): Promise<void> {
  const payCat = data().paymentCatByAccount[accountId]
  transactLocal(() => {
    upsertRecord(accountId, { name })
    if (payCat) upsertRecord(payCat._id, { name })
  })
}

/** Deletes the account, all of its transactions, transfer pairs, and its payment category. */
export async function deleteAccount(accountId: string): Promise<void> {
  const d = data()
  transactLocal(() => {
    for (const t of d.txns) {
      if (t.accountId !== accountId) continue
      if (t.transferTxnId) removeRecord(t.transferTxnId)
      removeRecord(t._id)
    }
    const payCat = d.paymentCatByAccount[accountId]
    if (payCat) deleteCategorySync(payCat._id)
    removeRecord(accountId)
  })
}

// ---------------------------------------------------------------------------
// Transactions (with transfer pairing)

export interface TxnInput {
  accountId: string
  date: string
  payee: string
  categoryId: string | null
  memo: string
  amount: number
  cleared: boolean
  /** When set, this txn is a transfer to/from that account */
  transferAccountId?: string | null
}

export async function saveTxn(input: TxnInput, existingId?: string): Promise<void> {
  const existing = existingId ? getRecord<TxnDoc>(existingId) : null
  const id = existing?._id ?? newId('txn')
  const oldPairId = existing?.transferTxnId

  transactLocal(() => {
    if (input.transferAccountId) {
      const pairId = oldPairId ?? newId('txn')
      const oldPair = oldPairId ? getRecord<TxnDoc>(oldPairId) : null
      upsertRecord(id, {
        type: 'txn',
        accountId: input.accountId,
        date: input.date,
        payee: '',
        categoryId: null,
        memo: input.memo,
        amount: input.amount,
        cleared: input.cleared,
        transferTxnId: pairId,
      })
      upsertRecord(pairId, {
        type: 'txn',
        accountId: input.transferAccountId!,
        date: input.date,
        payee: '',
        categoryId: null,
        memo: input.memo,
        amount: -input.amount,
        cleared: oldPair?.cleared ?? false,
        transferTxnId: id,
      })
    } else {
      if (oldPairId) removeRecord(oldPairId)
      upsertRecord(id, {
        type: 'txn',
        accountId: input.accountId,
        date: input.date,
        payee: input.payee,
        categoryId: input.categoryId,
        memo: input.memo,
        amount: input.amount,
        cleared: input.cleared,
        transferTxnId: undefined, // deletes the field if present
      })
    }
  })
}

export async function deleteTxn(txnId: string): Promise<void> {
  const t = getRecord<TxnDoc>(txnId)
  transactLocal(() => {
    if (t?.transferTxnId) removeRecord(t.transferTxnId)
    removeRecord(txnId)
  })
}

export async function toggleCleared(txnId: string): Promise<void> {
  const t = getRecord<TxnDoc>(txnId)
  if (t) upsertRecord(txnId, { cleared: !t.cleared })
}

// ---------------------------------------------------------------------------
// Budget allocations

export async function setAssigned(
  month: string,
  categoryId: string,
  amount: number,
): Promise<void> {
  const id = `alloc:${month}:${categoryId}`
  if (amount === 0) {
    removeRecord(id)
    return
  }
  upsertRecord(id, { type: 'alloc', month, categoryId, amount })
}

// ---------------------------------------------------------------------------
// Groups & categories

export async function createGroup(name: string): Promise<void> {
  const d = data()
  upsertRecord(newId('grp'), {
    type: 'group',
    name,
    sort: Math.max(-1, ...d.groups.map((g) => g.sort)) + 1,
  })
}

export async function renameGroup(groupId: string, name: string): Promise<void> {
  upsertRecord(groupId, { name })
}

/** Only allowed when the group has no categories. */
export async function deleteGroup(groupId: string): Promise<void> {
  const cats = data().categoriesByGroup[groupId] ?? []
  if (cats.length > 0) throw new Error('Group still has categories')
  removeRecord(groupId)
}

export async function createCategory(groupId: string, name: string): Promise<void> {
  const d = data()
  upsertRecord(newId('cat'), {
    type: 'category',
    groupId,
    name,
    sort: Math.max(-1, ...(d.categoriesByGroup[groupId] ?? []).map((c) => c.sort)) + 1,
  })
}

export async function renameCategory(categoryId: string, name: string): Promise<void> {
  upsertRecord(categoryId, { name })
}

export async function setCategoryHidden(categoryId: string, hidden: boolean): Promise<void> {
  upsertRecord(categoryId, { hidden })
}

function deleteCategorySync(categoryId: string): void {
  const d = data()
  for (const t of d.txns) {
    if (t.categoryId === categoryId) upsertRecord(t._id, { categoryId: null })
  }
  for (const a of d.allocs) {
    if (a.categoryId === categoryId) removeRecord(a._id)
  }
  removeRecord(categoryId)
}

/** Deletes the category; its transactions become uncategorized, allocations are removed. */
export async function deleteCategory(categoryId: string): Promise<void> {
  transactLocal(() => deleteCategorySync(categoryId))
}

function persistOrder(ids: string[], current: Record<string, { sort: number }>): void {
  for (let i = 0; i < ids.length; i++) {
    const doc = current[ids[i]]
    if (doc && doc.sort !== i) upsertRecord(ids[i], { sort: i })
  }
}

export async function reorderGroups(orderedIds: string[]): Promise<void> {
  const byId: Record<string, { sort: number }> = {}
  for (const g of data().groups) byId[g._id] = g
  transactLocal(() => persistOrder(orderedIds, byId))
}

/** Reorder within a group, or move a category to another group (position included). */
export async function reorderCategories(groupId: string, orderedIds: string[]): Promise<void> {
  const d = data()
  transactLocal(() => {
    for (const id of orderedIds) {
      const cat = d.categoriesById[id]
      if (cat && cat.groupId !== groupId) upsertRecord(id, { groupId })
    }
    const byId: Record<string, { sort: number }> = {}
    for (const c of d.categories) byId[c._id] = c
    persistOrder(orderedIds, byId)
  })
}
