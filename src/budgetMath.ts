import dayjs from 'dayjs'
import type { Data } from './store'
import { RTA, type TxnDoc } from './types'

export interface CatMonth {
  assigned: number
  activity: number
  available: number
}

export interface BudgetMonth {
  month: string
  /** Ready to Assign as of this month */
  rta: number
  cats: Record<string, CatMonth>
  totalAssigned: number
  totalActivity: number
  totalAvailable: number
}

export const monthOf = (date: string): string => date.slice(0, 7)
export const thisMonth = (): string => dayjs().format('YYYY-MM')

export function addMonths(month: string, n: number): string {
  return dayjs(`${month}-01`).add(n, 'month').format('YYYY-MM')
}

export function fmtMonth(month: string): string {
  return dayjs(`${month}-01`).format('MMM YYYY')
}

/**
 * Envelope math, computed by rolling forward from the earliest month with
 * data. Balances (including negative ones) carry forward month to month.
 *
 * Credit card mechanic: categorized spending on a credit account moves that
 * amount into the card's payment category; payments (transfers into the
 * card) draw it back down.
 */
export function computeBudget(data: Data, month: string): BudgetMonth {
  const { txns, allocs, accountsById, categories, paymentCatByAccount } = data

  // Per-month category activity and RTA inflows
  const activity: Record<string, Record<string, number>> = {} // month -> catId -> cents
  const rtaInflow: Record<string, number> = {}
  let earliest = month

  const bump = (m: string, catId: string, amount: number) => {
    const row = (activity[m] ??= {})
    row[catId] = (row[catId] ?? 0) + amount
  }

  const track = (m: string) => {
    if (m < earliest) earliest = m
  }

  for (const t of txns) {
    const m = monthOf(t.date)
    track(m)
    if (t.categoryId === RTA) {
      rtaInflow[m] = (rtaInflow[m] ?? 0) + t.amount
    } else if (t.categoryId) {
      bump(m, t.categoryId, t.amount)
    }
    const account = accountsById[t.accountId]
    if (account?.accountType === 'credit') {
      const isBudgetedSpend = t.categoryId && t.categoryId !== RTA
      const isTransfer = !!t.transferTxnId
      if (isBudgetedSpend || isTransfer) {
        const payCat = paymentCatByAccount[account._id]
        if (payCat) bump(m, payCat._id, -t.amount)
      }
    }
  }

  const assigned: Record<string, Record<string, number>> = {} // month -> catId -> cents
  for (const a of allocs) {
    track(a.month)
    const row = (assigned[a.month] ??= {})
    row[a.categoryId] = (row[a.categoryId] ?? 0) + a.amount
  }

  // Roll forward from the earliest month to the requested month
  const carry: Record<string, number> = {}
  let rtaRunning = 0
  let result: BudgetMonth = {
    month,
    rta: 0,
    cats: {},
    totalAssigned: 0,
    totalActivity: 0,
    totalAvailable: 0,
  }

  for (let m = earliest; m <= month; m = addMonths(m, 1)) {
    const cats: Record<string, CatMonth> = {}
    let totalAssigned = 0
    let totalActivity = 0
    let totalAvailable = 0
    for (const c of categories) {
      const a = assigned[m]?.[c._id] ?? 0
      const act = activity[m]?.[c._id] ?? 0
      const available = (carry[c._id] ?? 0) + a + act
      carry[c._id] = available
      cats[c._id] = { assigned: a, activity: act, available }
      totalAssigned += a
      totalActivity += act
      totalAvailable += available
    }
    rtaRunning += (rtaInflow[m] ?? 0) - totalAssigned
    if (m === month) {
      result = { month: m, rta: rtaRunning, cats, totalAssigned, totalActivity, totalAvailable }
    }
  }

  // Months after the requested one with assignments still owe money; YNAB
  // subtracts future-assigned from RTA. Keep it: assigned beyond `month`.
  let futureAssigned = 0
  for (const [m, row] of Object.entries(assigned)) {
    if (m > month) for (const v of Object.values(row)) futureAssigned += v
  }
  // Future RTA inflows are NOT available this month, but future assignments
  // do reduce what's assignable now.
  result.rta -= futureAssigned

  return result
}

export interface AccountBalances {
  cleared: number
  uncleared: number
  working: number
}

export function computeAccountBalances(txns: TxnDoc[]): Record<string, AccountBalances> {
  const out: Record<string, AccountBalances> = {}
  for (const t of txns) {
    const b = (out[t.accountId] ??= { cleared: 0, uncleared: 0, working: 0 })
    if (t.cleared) b.cleared += t.amount
    else b.uncleared += t.amount
    b.working += t.amount
  }
  return out
}

/** Distinct payees, most recently used first (transfers excluded). */
export function recentPayees(txns: TxnDoc[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const t of txns) {
    if (t.transferTxnId || !t.payee) continue
    if (!seen.has(t.payee)) {
      seen.add(t.payee)
      out.push(t.payee)
    }
  }
  return out
}
