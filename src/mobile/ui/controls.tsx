import type { ReactNode } from 'react'
import { fmtMoney } from '../../money'

/* --- Segmented control --------------------------------------------------- */

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex rounded-xl bg-raised p-1">
      {options.map((o) => (
        <button
          key={o.value}
          className={`flex-1 rounded-lg py-2 text-[13px] font-semibold transition-colors ${
            o.value === value ? 'bg-mint-deep text-mint' : 'text-mute active:text-fg'
          }`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* --- Switch --------------------------------------------------------------- */

export function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-[30px] w-[50px] shrink-0 rounded-full transition-colors duration-200 ${
        checked ? 'bg-mint' : 'bg-raised ring-1 ring-line'
      }`}
    >
      <span
        className={`absolute top-[3px] left-[3px] h-6 w-6 rounded-full bg-white shadow transition-transform duration-200 ${
          checked ? 'translate-x-5' : ''
        }`}
      />
    </button>
  )
}

/* --- Money pill ----------------------------------------------------------- */

export function Pill({ cents }: { cents: number }) {
  const cls =
    cents > 0
      ? 'bg-mint-deep text-mint'
      : cents < 0
        ? 'bg-loss-deep text-loss'
        : 'bg-raised text-faint'
  return (
    <span className={`tabular rounded-full px-2.5 py-1 text-[13px] font-semibold ${cls}`}>
      {fmtMoney(cents)}
    </span>
  )
}

/** Plain colored amount (no pill) */
export function Amount({ cents, dim }: { cents: number; dim?: boolean }) {
  const cls = cents > 0 ? 'text-mint' : cents < 0 ? 'text-loss' : dim ? 'text-faint' : 'text-fg'
  return <span className={`tabular font-semibold ${cls}`}>{fmtMoney(cents)}</span>
}

/* --- Grouped list scaffolding --------------------------------------------- */

export function SectionLabel({ children, extra }: { children: ReactNode; extra?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between px-5 pt-5 pb-1.5">
      <span className="text-[11px] font-semibold tracking-[0.08em] text-faint uppercase">
        {children}
      </span>
      {extra}
    </div>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`mx-4 overflow-hidden rounded-2xl bg-surface ring-1 ring-line ${className}`}>
      {children}
    </div>
  )
}

export function Divided({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-line">{children}</div>
}

/* --- Buttons & inputs ------------------------------------------------------ */

export function PrimaryButton({
  children,
  onClick,
  disabled,
  danger,
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`w-full rounded-xl py-3.5 text-[15px] font-semibold transition-transform active:scale-[0.98] disabled:opacity-40 ${
        danger ? 'bg-loss-deep text-loss' : 'bg-mint text-ink'
      }`}
    >
      {children}
    </button>
  )
}

export function GhostButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className="w-full rounded-xl bg-raised py-3.5 text-[15px] font-semibold text-fg transition-transform active:scale-[0.98] disabled:opacity-40"
    >
      {children}
    </button>
  )
}

export const inputCls =
  'w-full rounded-xl bg-raised px-3.5 py-3 text-[15px] text-fg placeholder:text-faint outline-none focus:ring-1 focus:ring-mint/60'
