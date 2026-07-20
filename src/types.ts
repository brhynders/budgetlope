export type AccountType = 'checking' | 'savings' | 'credit'

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  checking: 'Checking',
  savings: 'Savings',
  credit: 'Credit Card',
}

/** Pseudo-category id for "Inflow: Ready to Assign" */
export const RTA = 'rta'

/** Fixed id for the auto-managed Credit Card Payments group */
export const CC_GROUP_ID = 'grp:cc-payments'

export interface AccountDoc {
  _id: string // acct:<id>
  type: 'account'
  name: string
  accountType: AccountType
  sort: number
  closed?: boolean
}

export interface GroupDoc {
  _id: string // grp:<id>
  type: 'group'
  name: string
  sort: number
}

export interface CategoryDoc {
  _id: string // cat:<id>
  type: 'category'
  groupId: string
  name: string
  sort: number
  hidden?: boolean
  /** Set on auto-created credit card payment categories */
  ccAccountId?: string
}

export interface TxnDoc {
  _id: string // txn:<id>
  type: 'txn'
  accountId: string
  date: string // YYYY-MM-DD
  payee: string
  /** null = uncategorized or transfer; RTA = inflow to Ready to Assign */
  categoryId: string | null
  memo: string
  /** integer cents; inflow positive, outflow negative */
  amount: number
  cleared: boolean
  /** id of the paired txn in the other account when this is a transfer */
  transferTxnId?: string
}

export interface AllocDoc {
  _id: string // alloc:<YYYY-MM>:<catId>
  type: 'alloc'
  month: string // YYYY-MM
  categoryId: string
  amount: number // integer cents assigned
}

export type AnyDoc = AccountDoc | GroupDoc | CategoryDoc | TxnDoc | AllocDoc

export function isAccount(d: AnyDoc): d is AccountDoc {
  return d.type === 'account'
}
export function isGroup(d: AnyDoc): d is GroupDoc {
  return d.type === 'group'
}
export function isCategory(d: AnyDoc): d is CategoryDoc {
  return d.type === 'category'
}
export function isTxn(d: AnyDoc): d is TxnDoc {
  return d.type === 'txn'
}
export function isAlloc(d: AnyDoc): d is AllocDoc {
  return d.type === 'alloc'
}
