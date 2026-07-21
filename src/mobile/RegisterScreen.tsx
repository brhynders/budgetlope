import { useMemo, useState } from 'react'
import { FloatingBubble, List, NavBar, SwipeAction, Tag } from 'antd-mobile'
import { AddOutline, CheckCircleFill } from 'antd-mobile-icons'
import { useNavigate, useParams } from 'react-router-dom'
import dayjs from 'dayjs'
import { useData } from '../store'
import { computeAccountBalances } from '../budgetMath'
import { fmtMoney } from '../money'
import { deleteTxn, toggleCleared } from '../actions'
import { RTA, type TxnDoc } from '../types'
import TxnSheet from './TxnSheet'

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

  if (!account) return <NavBar onBack={() => navigate('/accounts')}>Not found</NavBar>

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
      <NavBar onBack={() => navigate('/accounts')}>
        <div style={{ fontWeight: 700 }}>{account.name}</div>
        <div style={{ fontSize: 12, color: '#888' }}>
          {fmtMoney(bal.working)} · {fmtMoney(bal.cleared)} cleared
        </div>
      </NavBar>

      {byDate.map(([date, rows]) => (
        <div key={date}>
          <div className="m-date-header">{dayjs(date).format('dddd, MMMM D, YYYY')}</div>
          <List>
            {rows.map((t) => (
              <SwipeAction
                key={t._id}
                rightActions={[
                  { key: 'clear', text: t.cleared ? 'Unclear' : 'Clear', color: 'primary' },
                  { key: 'delete', text: 'Delete', color: 'danger' },
                ]}
                onAction={(action) => {
                  if (action.key === 'delete') void deleteTxn(t._id)
                  if (action.key === 'clear') void toggleCleared(t._id)
                }}
              >
                <List.Item
                  clickable
                  arrowIcon={false}
                  description={
                    <span>
                      {catLabel(t)}
                      {t.memo ? ` · ${t.memo}` : ''}
                    </span>
                  }
                  extra={
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className={`m-amount ${t.amount > 0 ? 'pos' : t.amount < 0 ? '' : 'zero'}`}>
                        {fmtMoney(t.amount)}
                      </span>
                      {t.cleared && <CheckCircleFill style={{ color: '#1a7f64', fontSize: 14 }} />}
                    </span>
                  }
                  onClick={() => {
                    setEditTxn(t)
                    setSheetOpen(true)
                  }}
                >
                  {t.transferTxnId ? catLabel(t) : t.payee || '—'}
                </List.Item>
              </SwipeAction>
            ))}
          </List>
        </div>
      ))}

      {txns.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>
          No transactions yet.
          <br />
          Tap <Tag color="primary">+</Tag> to add one.
        </div>
      )}

      <FloatingBubble
        style={{
          '--initial-position-bottom': 'calc(84px + env(safe-area-inset-bottom))',
          '--initial-position-right': '20px',
          '--background': '#1a7f64',
        }}
        onClick={() => {
          setEditTxn(null)
          setSheetOpen(true)
        }}
      >
        <AddOutline fontSize={26} />
      </FloatingBubble>

      <TxnSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        accountId={accountId}
        txn={editTxn}
      />
    </div>
  )
}
