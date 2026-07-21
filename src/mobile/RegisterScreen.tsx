import { useMemo, useState } from 'react'
import { CheckCircle2, ChevronLeft, Circle, Plus, Trash2 } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import dayjs from 'dayjs'
import { useData } from '../store'
import { computeAccountBalances } from '../budgetMath'
import { deleteTxn, toggleCleared } from '../actions'
import { RTA, type TxnDoc } from '../types'
import TxnSheet from './TxnSheet'
import SwipeRow from './ui/SwipeRow'
import { Amount, Card, Divided } from './ui/controls'

export default function RegisterScreen() {
  const { id } = useParams()
  const navigate = useNavigate()
  const data = useData()
  const accountId = `acct:${id}`
  const account = data.accountsById[accountId]

  const [sheetOpen, setSheetOpen] = useState(false)
  const [editTxn, setEditTxn] = useState<TxnDoc | null>(null)

  const txns = useMemo(
    () => data.txns.filter((t) => t.accountId === accountId),
    [data.txns, accountId],
  )
  const balances = useMemo(() => computeAccountBalances(data.txns), [data.txns])
  const bal = balances[accountId] ?? { cleared: 0, uncleared: 0, working: 0 }

  if (!account)
    return (
      <div className="px-5 py-6">
        <button className="flex items-center gap-1 text-mute" onClick={() => navigate('/accounts')}>
          <ChevronLeft size={20} /> Accounts
        </button>
        <div className="mt-8 text-center text-mute">This account no longer exists.</div>
      </div>
    )

  const byDate: [string, TxnDoc[]][] = []
  for (const t of txns) {
    const last = byDate[byDate.length - 1]
    if (last && last[0] === t.date) last[1].push(t)
    else byDate.push([t.date, [t]])
  }

  const catLabel = (t: TxnDoc): string => {
    if (t.transferTxnId) {
      const pair = data.txnsById[t.transferTxnId]
      const other = pair ? data.accountsById[pair.accountId] : undefined
      return `Transfer : ${other?.name ?? '?'}`
    }
    if (t.categoryId === RTA) return 'Ready to Assign'
    if (!t.categoryId) return 'Needs a category'
    return data.categoriesById[t.categoryId]?.name ?? 'Needs a category'
  }

  return (
    <div>
      <header className="flex items-center gap-1 px-2 pt-3 pb-1">
        <button
          aria-label="Back to accounts"
          className="p-2 text-mute active:text-fg"
          onClick={() => navigate('/accounts')}
        >
          <ChevronLeft size={24} />
        </button>
        <h1 className="truncate text-[18px] font-bold">{account.name}</h1>
      </header>

      {/* Balance summary */}
      <div className="mx-4 grid grid-cols-3 divide-x divide-line rounded-2xl bg-surface py-3 ring-1 ring-line">
        {(
          [
            ['Cleared', bal.cleared],
            ['Uncleared', bal.uncleared],
            ['Working', bal.working],
          ] as const
        ).map(([label, cents]) => (
          <div key={label} className="px-2 text-center">
            <div className="text-[11px] font-medium tracking-wide text-faint">{label}</div>
            <div className="text-[14px]">
              <Amount cents={cents} dim={cents === 0} />
            </div>
          </div>
        ))}
      </div>

      {byDate.map(([date, rows]) => (
        <section key={date}>
          <div className="px-5 pt-4 pb-1.5 text-[11px] font-semibold tracking-[0.08em] text-faint uppercase">
            {dayjs(date).format('ddd, MMM D, YYYY')}
          </div>
          <Card>
            <Divided>
              {rows.map((t) => (
                <SwipeRow
                  key={t._id}
                  right={[
                    {
                      key: 'clear',
                      label: t.cleared ? 'Unclear' : 'Clear',
                      icon: t.cleared ? <Circle size={17} /> : <CheckCircle2 size={17} />,
                      tone: 'accent',
                      onPress: () => void toggleCleared(t._id),
                    },
                    {
                      key: 'delete',
                      label: 'Delete',
                      icon: <Trash2 size={17} />,
                      tone: 'danger',
                      onPress: () => void deleteTxn(t._id),
                    },
                  ]}
                  onTap={() => {
                    setEditTxn(t)
                    setSheetOpen(true)
                  }}
                >
                  <div className="flex items-center gap-3 px-4 py-3">
                    <span
                      className={t.cleared ? 'text-mint' : 'text-faint'}
                      aria-label={t.cleared ? 'Cleared' : 'Uncleared'}
                    >
                      {t.cleared ? <CheckCircle2 size={17} /> : <Circle size={17} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium">
                        {t.transferTxnId ? catLabel(t) : t.payee || '—'}
                      </span>
                      <span className="block truncate text-[12px] text-faint">
                        {catLabel(t)}
                        {t.memo ? ` · ${t.memo}` : ''}
                      </span>
                    </span>
                    <Amount cents={t.amount} dim={t.amount === 0} />
                  </div>
                </SwipeRow>
              ))}
            </Divided>
          </Card>
        </section>
      ))}

      {txns.length === 0 && (
        <div className="px-10 py-14 text-center text-[14px] leading-relaxed text-mute">
          No transactions yet. Tap the{' '}
          <span className="inline-flex translate-y-[3px] rounded-full bg-mint-deep p-0.5 text-mint">
            <Plus size={14} />
          </span>{' '}
          button to add the first one.
        </div>
      )}

      <button
        aria-label="Add transaction"
        className="fixed right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-mint text-ink shadow-lg shadow-black/40 transition-transform active:scale-90"
        style={{ bottom: 'calc(84px + env(safe-area-inset-bottom))' }}
        onClick={() => {
          setEditTxn(null)
          setSheetOpen(true)
        }}
      >
        <Plus size={26} />
      </button>

      <TxnSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        accountId={accountId}
        txn={editTxn}
      />
    </div>
  )
}
