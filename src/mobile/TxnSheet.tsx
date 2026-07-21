import { useEffect, useState } from 'react'
import {
  Button,
  DatePicker,
  Dialog,
  Input,
  List,
  Popup,
  SearchBar,
  Selector,
  Switch,
  Toast,
} from 'antd-mobile'
import dayjs from 'dayjs'
import { useData } from '../store'
import { deleteTxn, saveTxn } from '../actions'
import { fmtMoneyAbs, parseMoney } from '../money'
import { RTA, type TxnDoc } from '../types'

type Kind = 'out' | 'in' | 'transfer'

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  borderBottom: '1px solid #f0f0f0',
  padding: '12px 4px',
}

const sheetBody: React.CSSProperties = {
  borderTopLeftRadius: 16,
  borderTopRightRadius: 16,
  padding: '20px 20px calc(32px + env(safe-area-inset-bottom))',
  maxHeight: '85vh',
  overflowY: 'auto',
}

function ListPickerPopup({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <Popup visible={visible} onMaskClick={onClose} position="bottom" bodyStyle={sheetBody}>
      <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>{title}</div>
      {children}
    </Popup>
  )
}

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
  const [datePickerOpen, setDatePickerOpen] = useState(false)
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
        ? data.categoriesById[categoryId]?.name ?? 'Choose…'
        : 'Choose…'

  const save = async () => {
    const cents = parseMoney(amount)
    if (cents === null || cents === 0) {
      Toast.show('Enter an amount')
      return
    }
    if (kind === 'transfer' && !transferTarget) {
      Toast.show('Pick the other account')
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
    Toast.show(txn ? 'Saved' : `Added ${fmtMoneyAbs(signed)}`)
    onClose()
  }

  const remove = async () => {
    if (!txn) return
    const ok = await Dialog.confirm({ content: 'Delete this transaction?' })
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
    <Popup visible={visible} onMaskClick={onClose} position="bottom" bodyStyle={sheetBody}>
      <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 16 }}>
        {txn ? 'Edit Transaction' : 'Add Transaction'}
      </div>

      <Selector
        options={[
          { label: 'Outflow', value: 'out' },
          { label: 'Inflow', value: 'in' },
          { label: 'Transfer', value: 'transfer' },
        ]}
        columns={3}
        value={[kind]}
        onChange={(v) => v.length && setKind(v[0] as Kind)}
        style={{ marginBottom: 12 }}
      />

      <div style={rowStyle}>
        <span style={{ color: '#888', flexShrink: 0 }}>Amount $</span>
        <Input
          type="number"
          inputMode="decimal"
          placeholder="0.00"
          value={amount}
          onChange={setAmount}
          style={{ '--text-align': 'right' } as React.CSSProperties}
        />
      </div>

      {kind === 'transfer' ? (
        <>
          <div style={rowStyle} onClick={() => setTargetPickerOpen(true)}>
            <span style={{ color: '#888' }}>{direction === 'to' ? 'To' : 'From'}</span>
            <span>
              {transferTarget ? data.accountsById[transferTarget]?.name : 'Choose account…'}
            </span>
          </div>
          <Selector
            options={[
              { label: 'Money out (to)', value: 'to' },
              { label: 'Money in (from)', value: 'from' },
            ]}
            columns={2}
            value={[direction]}
            onChange={(v) => v.length && setDirection(v[0] as 'to' | 'from')}
            style={{ margin: '12px 0' }}
          />
        </>
      ) : (
        <>
          <div style={rowStyle}>
            <span style={{ color: '#888', flexShrink: 0 }}>Payee</span>
            <Input
              placeholder="Payee"
              value={payee}
              onChange={setPayee}
              style={{ '--text-align': 'right' } as React.CSSProperties}
            />
          </div>
          <div style={rowStyle} onClick={() => setCatPickerOpen(true)}>
            <span style={{ color: '#888', flexShrink: 0 }}>Category</span>
            <span style={{ color: categoryId ? undefined : '#bbb' }}>{catLabel}</span>
          </div>
        </>
      )}

      <div style={rowStyle} onClick={() => setDatePickerOpen(true)}>
        <span style={{ color: '#888', flexShrink: 0 }}>Date</span>
        <span>{dayjs(date).format('ddd, MMM D YYYY')}</span>
      </div>

      <div style={rowStyle}>
        <span style={{ color: '#888', flexShrink: 0 }}>Memo</span>
        <Input
          placeholder="Optional"
          value={memo}
          onChange={setMemo}
          style={{ '--text-align': 'right' } as React.CSSProperties}
        />
      </div>

      <div style={rowStyle}>
        <span style={{ color: '#888' }}>Cleared</span>
        <Switch checked={cleared} onChange={setCleared} />
      </div>

      <div style={{ display: 'grid', gap: 10, marginTop: 20 }}>
        <Button block color="primary" size="large" onClick={() => void save()}>
          Save
        </Button>
        {txn && (
          <Button block color="danger" fill="outline" onClick={() => void remove()}>
            Delete
          </Button>
        )}
      </div>

      <ListPickerPopup
        visible={catPickerOpen}
        title="Category"
        onClose={() => setCatPickerOpen(false)}
      >
        <SearchBar
          placeholder="Search categories"
          value={catSearch}
          onChange={setCatSearch}
          style={{ marginBottom: 8 }}
        />
        {!q && (
          <List style={{ margin: '0 -12px' }}>
            <List.Item
              clickable
              arrowIcon={false}
              onClick={() => {
                setCategoryId(RTA)
                setCatPickerOpen(false)
              }}
            >
              <span style={{ color: '#1a7f64', fontWeight: 600 }}>Inflow: Ready to Assign</span>
            </List.Item>
          </List>
        )}
        {catGroups.map(({ group, cats }) => (
          <List key={group._id} header={group.name} style={{ margin: '0 -12px' }}>
            {cats.map((c) => (
              <List.Item
                key={c._id}
                clickable
                arrowIcon={false}
                onClick={() => {
                  setCategoryId(c._id)
                  setCatPickerOpen(false)
                }}
              >
                {c.name}
              </List.Item>
            ))}
          </List>
        ))}
      </ListPickerPopup>

      <ListPickerPopup
        visible={targetPickerOpen}
        title="Account"
        onClose={() => setTargetPickerOpen(false)}
      >
        <List style={{ margin: '0 -12px' }}>
          {otherAccounts.map((a) => (
            <List.Item
              key={a._id}
              clickable
              arrowIcon={false}
              onClick={() => {
                setTransferTarget(a._id)
                setTargetPickerOpen(false)
              }}
            >
              {a.name}
            </List.Item>
          ))}
        </List>
      </ListPickerPopup>

      <DatePicker
        visible={datePickerOpen}
        onClose={() => setDatePickerOpen(false)}
        precision="day"
        value={dayjs(date).toDate()}
        onConfirm={(d) => setDate(dayjs(d).format('YYYY-MM-DD'))}
      />
    </Popup>
  )
}
