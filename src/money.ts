const fmt = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'USD',
})

/** Format integer cents as currency, e.g. -123456 -> "-$1,234.56" */
export function fmtMoney(cents: number): string {
  return fmt.format(cents / 100)
}

/** Format cents without sign, for outflow/inflow columns */
export function fmtMoneyAbs(cents: number): string {
  return fmt.format(Math.abs(cents) / 100)
}

/**
 * Parse a user-typed amount into integer cents.
 * Accepts "1,234.56", "$12", "-5.5", "12.3". Returns null when unparseable.
 */
export function parseMoney(input: string): number | null {
  const s = input.replace(/[$,\s]/g, '')
  if (!s) return null
  if (!/^-?\d*\.?\d*$/.test(s) || s === '-' || s === '.' || s === '-.') return null
  const n = Number(s)
  if (Number.isNaN(n)) return null
  return Math.round(n * 100)
}

/** Cents -> plain editable string, e.g. 123456 -> "1234.56", 0 -> "" */
export function centsToInput(cents: number): string {
  if (cents === 0) return ''
  return (cents / 100).toFixed(2)
}
