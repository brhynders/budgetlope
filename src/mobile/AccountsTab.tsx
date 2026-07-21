import { useMemo, useState } from 'react'
import { CreditCard, Landmark, PiggyBank, Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useData } from '../store'
import { computeAccountBalances } from '../budgetMath'
import { parseMoney } from '../money'
import { createAccount } from '../actions'
import { ACCOUNT_TYPE_LABELS, type AccountType } from '../types'
import Sheet from './ui/Sheet'
import { toast } from './ui/Toast'
import { Amount, Card, Divided, PrimaryButton, SectionLabel, Segmented, inputCls } from './ui/controls'

const TYPE_ICON: Record<AccountType, typeof Landmark> = {
  checking: Landmark,
  savings: PiggyBank,
  credit: CreditCard,
}

export default function AccountsTab() {
  const data = useData()
  const navigate = useNavigate()
  const balances = useMemo(() => computeAccountBalances(data.txns), [data.txns])
  const total = data.accounts.reduce((s, a) => s + (balances[a._id]?.working ?? 0), 0)

  const [addOpen, setAddOpen] = useState(false)
  const [name, setName] = useState('')
  const [accountType, setAccountType] = useState<AccountType>('checking')
  const [balance, setBalance] = useState('')

  const add = async () => {
    if (!name.trim()) {
      toast('Give the account a name')
      return
    }
    const cents = balance.trim() ? parseMoney(balance) : 0
    if (cents === null) {
      toast('Could not parse the balance')
      return
    }
    const id = await createAccount(name.trim(), accountType, cents)
    setAddOpen(false)
    setName('')
    setBalance('')
    setAccountType('checking')
    navigate(`/account/${id.slice(5)}`)
  }

  return (
    <div>
      <header className="flex items-center justify-between px-5 pt-4 pb-1">
        <h1 className="text-[22px] font-bold">Accounts</h1>
        <button
          aria-label="Add account"
          className="rounded-full bg-mint-deep p-2 text-mint active:scale-95"
          onClick={() => setAddOpen(true)}
        >
          <Plus size={20} />
        </button>
      </header>

      <div className="mx-4 mt-2 flex items-center justify-between rounded-2xl bg-surface px-4 py-3.5 ring-1 ring-line">
        <span className="text-[13px] font-medium text-mute">Net total</span>
        <span className="text-[20px]">
          <Amount cents={total} />
        </span>
      </div>

      <SectionLabel>All accounts</SectionLabel>
      <Card>
        <Divided>
          {data.accounts.map((a) => {
            const bal = balances[a._id]?.working ?? 0
            const Icon = TYPE_ICON[a.accountType]
            return (
              <button
                key={a._id}
                className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-raised"
                onClick={() => navigate(`/account/${a._id.slice(5)}`)}
              >
                <span className="rounded-xl bg-raised p-2 text-mute">
                  <Icon size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium">{a.name}</span>
                  <span className="block text-[12px] text-faint">
                    {ACCOUNT_TYPE_LABELS[a.accountType]}
                  </span>
                </span>
                <Amount cents={bal} dim={bal === 0} />
              </button>
            )
          })}
          {data.accounts.length === 0 && (
            <div className="px-4 py-8 text-center text-[14px] text-mute">
              No accounts yet. Tap <span className="font-semibold text-mint">+</span> to add your
              first one.
            </div>
          )}
        </Divided>
      </Card>

      <Sheet open={addOpen} onClose={() => setAddOpen(false)} title="Add account">
        <div className="grid gap-3 pt-1">
          <input
            placeholder="Nickname, e.g. Chase Checking"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputCls}
          />
          <Segmented
            options={Object.entries(ACCOUNT_TYPE_LABELS).map(([value, label]) => ({
              value: value as AccountType,
              label,
            }))}
            value={accountType}
            onChange={setAccountType}
          />
          <input
            placeholder="Current balance (negative for credit card debt)"
            type="number"
            inputMode="decimal"
            value={balance}
            onChange={(e) => setBalance(e.target.value)}
            className={inputCls}
          />
          <PrimaryButton onClick={() => void add()}>Add account</PrimaryButton>
        </div>
      </Sheet>
    </div>
  )
}
