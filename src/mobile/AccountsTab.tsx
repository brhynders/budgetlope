import { useMemo, useState } from 'react'
import { Button, Input, List, NavBar, Popup, Selector, Toast } from 'antd-mobile'
import { AddOutline } from 'antd-mobile-icons'
import { useNavigate } from 'react-router-dom'
import { useData } from '../store'
import { computeAccountBalances } from '../budgetMath'
import { fmtMoney, parseMoney } from '../money'
import { createAccount } from '../actions'
import { ACCOUNT_TYPE_LABELS, type AccountType } from '../types'

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
      Toast.show('Give the account a name')
      return
    }
    const cents = balance.trim() ? parseMoney(balance) : 0
    if (cents === null) {
      Toast.show('Could not parse the balance')
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
      <NavBar
        back={null}
        right={
          <Button size="small" fill="none" onClick={() => setAddOpen(true)}>
            <AddOutline fontSize={20} />
          </Button>
        }
      >
        Accounts
      </NavBar>

      <div
        style={{
          margin: '4px 16px 12px',
          borderRadius: 12,
          padding: '12px 16px',
          background: '#e7f6f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span style={{ color: '#555' }}>Total</span>
        <span className={`m-amount ${total < 0 ? 'neg' : 'pos'}`} style={{ fontSize: 20 }}>
          {fmtMoney(total)}
        </span>
      </div>

      <List>
        {data.accounts.map((a) => {
          const bal = balances[a._id]?.working ?? 0
          return (
            <List.Item
              key={a._id}
              clickable
              description={ACCOUNT_TYPE_LABELS[a.accountType]}
              extra={
                <span className={`m-amount ${bal < 0 ? 'neg' : ''}`}>{fmtMoney(bal)}</span>
              }
              onClick={() => navigate(`/account/${a._id.slice(5)}`)}
            >
              {a.name}
            </List.Item>
          )
        })}
        {data.accounts.length === 0 && (
          <List.Item description="Tap + to add your first account">No accounts yet</List.Item>
        )}
      </List>

      <Popup
        visible={addOpen}
        onMaskClick={() => setAddOpen(false)}
        position="bottom"
        bodyStyle={{ borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20 }}
      >
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 16 }}>Add Account</div>
        <div style={{ display: 'grid', gap: 12 }}>
          <Input placeholder="Nickname, e.g. Chase Checking" value={name} onChange={setName} />
          <Selector
            options={Object.entries(ACCOUNT_TYPE_LABELS).map(([value, label]) => ({
              value,
              label,
            }))}
            value={[accountType]}
            onChange={(v) => v.length && setAccountType(v[0] as AccountType)}
          />
          <Input
            placeholder="Current balance (negative for credit card debt)"
            type="number"
            inputMode="decimal"
            value={balance}
            onChange={setBalance}
          />
          <Button block color="primary" size="large" onClick={() => void add()}>
            Add Account
          </Button>
        </div>
      </Popup>
    </div>
  )
}
