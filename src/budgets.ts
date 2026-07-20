import { nanoid } from 'nanoid'

export interface BudgetMeta {
  id: string
  name: string
}

const LIST_KEY = 'budgetlope.budgets'
const CURRENT_KEY = 'budgetlope.currentBudget'

export function loadBudgets(): BudgetMeta[] {
  try {
    const raw = localStorage.getItem(LIST_KEY)
    if (raw) {
      const list = JSON.parse(raw) as BudgetMeta[]
      if (Array.isArray(list) && list.length > 0) return list
    }
  } catch {
    // fall through
  }
  // First run (or pre-multi-budget data): the legacy database becomes "My Budget"
  const initial = [{ id: 'default', name: 'My Budget' }]
  localStorage.setItem(LIST_KEY, JSON.stringify(initial))
  return initial
}

function saveBudgets(list: BudgetMeta[]): void {
  localStorage.setItem(LIST_KEY, JSON.stringify(list))
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
  return b
}

export function renameBudget(id: string, name: string): void {
  saveBudgets(loadBudgets().map((b) => (b.id === id ? { ...b, name } : b)))
}

/**
 * Remove a budget and its local data. Only non-active budgets can be deleted
 * (their database has no open connection, so the delete cannot be blocked).
 */
export function deleteBudget(id: string): void {
  const list = loadBudgets()
  if (list.length <= 1) throw new Error('Cannot delete the only budget')
  if (id === currentBudget().id) throw new Error('Switch to another budget first')
  const target = list.find((b) => b.id === id)
  if (!target) return
  saveBudgets(list.filter((b) => b.id !== id))
  indexedDB.deleteDatabase(docNameFor(target))
}

/** Persist the choice and reload — the whole app boots against the new Y.Doc. */
export function switchBudget(id: string): void {
  localStorage.setItem(CURRENT_KEY, id)
  // Routes reference ids from the old budget; land on the budget screen
  location.hash = '#/budget'
  location.reload()
}
