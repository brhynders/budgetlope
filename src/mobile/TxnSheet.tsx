import { useEffect, useState, type ReactNode } from 'react'
import { Search } from 'lucide-react'
import dayjs from 'dayjs'
import { useData } from '../store'
import { deleteTxn, saveTxn } from '../actions'
import { fmtMoneyAbs, parseMoney } from '../money'
import { RTA, type TxnDoc } from '../types'
import Sheet from './ui/Sheet'
import { toast } from './ui/Toast'
import { confirmDialog } from './ui/Dialog'
import { PrimaryButton, Segmented, Switch } from './ui/controls'

type Kind = 'out' | 'in' | 'transfer'

function Row({
  label,
  onClick,
  children,
}: {
  label: string
  onClick?: () => void
  children: ReactNode
}) {
  return (
    <div
      className="flex min-h-[52px] items-center justify-between gap-3 border-b border-line px-1 py-2"
      onClick={onClick}
    >
      <span className="shrink-0 text-[14px] text-mute">{label}</span>
      {children}
    </div>
  )
}

const rightInput =
  'tabular w-full bg-transparent text-right text-[15px] font-medium outline-none placeholder:text-faint'

export default function TxnSheet({
  visible,
  onClose,
  accountId,
  txn,
}: {
  visible: boolean
  onClose: () => void
  accountId: string
  txn: TxnDoc | null
}) {
  const data = useData()

  const [kind, setKind] = useState<Kind>('out')
  const [amount, setAmount] = useState('')
  const [payee, setPayee] = useState('')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [transferTarget, setTransferTarget] = useState<string | null>(null)
  const [direction, setDirection] = useState<'to' | 'from'>('to')
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'))
  const [memo, setMemo] = useState('')
  const [cleared, setCleared] = useState(false)
  const [catPickerOpen, setCatPickerOpen] = useState(false)
  const [catSearch, setCatSearch] = useState('')
  const [targetPickerOpen, setTargetPickerOpen] = useState(false)

  useEffect(() => {
    if (!visible) return
    if (txn) {
      const pair = txn.transferTxnId ? data.txnsById[txn.transferTxnId] : undefined
      setKind(pair ? 'transfer' : txn.amount > 0 ? 'in' : 'out')
      setAmount(txn.amount === 0 ? '' : (Math.abs(txn.amount) / 100).toFixed(2))
      setPayee(pair ? '' : txn.payee)
      setCategoryId(txn.categoryId)
      setTransferTarget(pair?.accountId ?? null)
      setDirection(txn.amount > 0 ? 'from' : 'to')
      setDate(txn.date)
      setMemo(txn.memo)
      setCleared(txn.cleared)
    } else {
      setKind('out')
      setAmount('')
      setPayee('')
      setCategoryId(null)
      setTransferTarget(null)
      setDirection('to')
      setDate(dayjs().format('YYYY-MM-DD'))
      setMemo('')
      setCleared(false)
    }
    setCatSearch('')
  }, [visible, txn, data.txnsById])

  const otherAccounts = data.accounts.filter((a) => a._id !== (txn?.accountId ?? accountId))

  const catLabel =
    categoryId === RTA
      ? 'Inflow: Ready to Assign'
      : categoryId
        ? (data.categoriesById[categoryId]?.name ?? 'Choose…')
        : 'Choose…'

  const save = async () => {
    const cents = parseMoney(amount)
    if (cents === null || cents === 0) {
      toast('Enter an amount')
      return
    }
    if (kind === 'transfer' && !transferTarget) {
      toast('Pick the other account')
      return
    }
    const abs = Math.abs(cents)
    const signed = kind === 'in' || (kind === 'transfer' && direction === 'from') ? abs : -abs
    await saveTxn(
      {
        accountId: txn?.accountId ?? accountId,
        date,
        payee: kind === 'transfer' ? '' : payee.trim(),
        categoryId:
          kind === 'transfer' ? null : kind === 'in' && categoryId === null ? RTA : categoryId,
        memo: memo.trim(),
        amount: signed,
        cleared,
        transferAccountId: kind === 'transfer' ? transferTarget : null,
      },
      txn?._id,
    )
    toast(txn ? 'Saved' : `Added ${fmtMoneyAbs(signed)}`)
    onClose()
  }

  const remove = async () => {
    if (!txn) return
    const ok = await confirmDialog({
      message: 'Delete this transaction?',
      confirmText: 'Delete',
      danger: true,
    })
    if (ok) {
      await deleteTxn(txn._id)
      onClose()
    }
  }

  const q = catSearch.trim().toLowerCase()
  const catGroups = data.groups
    .map((g) => ({
      group: g,
      cats: (data.categoriesByGroup[g._id] ?? []).filter(
        (c) => (!c.hidden || c._id === categoryId) && (!q || c.name.toLowerCase().includes(q)),
      ),
    }))
    .filter((g) => g.cats.length > 0)

  return (
    <Sheet
      open={visible}
      onClose={onClose}
      title={txn ? 'Edit transaction' : 'Add transaction'}
      tall
    >
      <div className="pt-1">
        <Segmented
          options={[
            { label: 'Outflow', value: 'out' },
            { label: 'Inflow', value: 'in' },
            { label: 'Transfer', value: 'transfer' },
          ]}
          value={kind}
          onChange={setKind}
        />

        <div className="mt-3">
          <Row label="Amount $">
            <input
              type="number"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={`${rightInput} text-[19px] font-semibold`}
            />
          </Row>

          {kind === 'transfer' ? (
            <>
              <Row label={direction === 'to' ? 'To' : 'From'} onClick={() => setTargetPickerOpen(true)}>
                <span className={`text-[15px] ${transferTarget ? '' : 'text-faint'}`}>
                  {transferTarget ? data.accountsById[transferTarget]?.name : 'Choose account…'}
                </span>
              </Row>
              <div className="border-b border-line px-1 py-3">
                <Segmented
                  options={[
                    { label: 'Money out (to)', value: 'to' },
                    { label: 'Money in (from)', value: 'from' },
                  ]}
                  value={direction}
                  onChange={setDirection}
                />
              </div>
            </>
          ) : (
            <>
              <Row label="Payee">
                <input
                  placeholder="Payee"
                  value={payee}
                  onChange={(e) => setPayee(e.target.value)}
                  className={rightInput}
                />
              </Row>
              <Row label="Category" onClick={() => setCatPickerOpen(true)}>
                <span className={`text-[15px] ${categoryId ? '' : 'text-faint'}`}>{catLabel}</span>
              </Row>
            </>
          )}

          <Row label="Date">
            <input
              type="date"
              value={date}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              className="tabular bg-transparent text-right text-[15px] font-medium outline-none"
            />
          </Row>

          <Row label="Memo">
            <input
              placeholder="Optional"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              className={rightInput}
            />
          </Row>

          <Row label="Cleared">
            <Switch checked={cleared} onChange={setCleared} />
          </Row>
        </div>

        <div className="mt-5 grid gap-2.5">
          <PrimaryButton onClick={() => void save()}>Save</PrimaryButton>
          {txn && (
            <PrimaryButton danger onClick={() => void remove()}>
              Delete
            </PrimaryButton>
          )}
        </div>
      </div>

      {/* Category picker */}
      <Sheet open={catPickerOpen} onClose={() => setCatPickerOpen(false)} title="Category" tall>
        <div className="sticky top-0 -mx-1 flex items-center gap-2 rounded-xl bg-raised px-3 py-2.5">
          <Search size={16} className="shrink-0 text-faint" />
          <input
            placeholder="Search categories"
            value={catSearch}
            onChange={(e) => setCatSearch(e.target.value)}
            className="w-full bg-transparent text-[15px] outline-none placeholder:text-faint"
          />
        </div>
        {!q && (
          <button
            className="w-full border-b border-line px-1 py-3 text-left text-[15px] font-semibold text-mint active:bg-raised"
            onClick={() => {
              setCategoryId(RTA)
              setCatPickerOpen(false)
            }}
          >
            Inflow: Ready to Assign
          </button>
        )}
        {catGroups.map(({ group, cats }) => (
          <div key={group._id}>
            <div className="px-1 pt-4 pb-1 text-[11px] font-semibold tracking-[0.08em] text-faint uppercase">
              {group.name}
            </div>
            {cats.map((c) => (
              <button
                key={c._id}
                className={`w-full border-b border-line px-1 py-3 text-left text-[15px] active:bg-raised ${
                  c._id === categoryId ? 'font-semibold text-mint' : ''
                }`}
                onClick={() => {
                  setCategoryId(c._id)
                  setCatPickerOpen(false)
                }}
              >
                {c.name}
              </button>
            ))}
          </div>
        ))}
      </Sheet>

      {/* Transfer account picker */}
      <Sheet open={targetPickerOpen} onClose={() => setTargetPickerOpen(false)} title="Account">
        {otherAccounts.map((a) => (
          <button
            key={a._id}
            className={`w-full border-b border-line px-1 py-3 text-left text-[15px] active:bg-raised ${
              a._id === transferTarget ? 'font-semibold text-mint' : ''
            }`}
            onClick={() => {
              setTransferTarget(a._id)
              setTargetPickerOpen(false)
            }}
          >
            {a.name}
          </button>
        ))}
      </Sheet>
    </Sheet>
  )
}
