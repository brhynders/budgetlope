import { fmtMoney } from '../money'

export default function MoneyText({
  cents,
  colored = true,
  strong,
}: {
  cents: number
  colored?: boolean
  strong?: boolean
}) {
  const cls = !colored ? '' : cents > 0 ? 'pos' : cents < 0 ? 'neg' : 'zero'
  return (
    <span
      className={cls}
      style={{ fontVariantNumeric: 'tabular-nums', fontWeight: strong ? 600 : undefined }}
    >
      {fmtMoney(cents)}
    </span>
  )
}
