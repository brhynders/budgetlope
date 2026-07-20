import { useMemo, useState } from 'react'
import { App, Badge, Button, Dropdown, Input, Layout, Modal, Tooltip, Typography } from 'antd'
import {
  CheckOutlined,
  CreditCardOutlined,
  DownOutlined,
  PlusOutlined,
  SettingOutlined,
  WalletOutlined,
} from '@ant-design/icons'
import { NavLink } from 'react-router-dom'
import { useData, useStore } from '../store'
import { computeAccountBalances } from '../budgetMath'
import { fmtMoney } from '../money'
import {
  createBudget,
  currentBudget,
  deleteBudget,
  renameBudget,
  switchBudget,
  useBudgets,
} from '../budgets'
import AccountModal from './AccountModal'

const linkStyle = ({ isActive }: { isActive: boolean }): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  padding: '7px 12px',
  borderRadius: 8,
  color: isActive ? '#fff' : 'rgba(255,255,255,0.82)',
  background: isActive ? 'rgba(255,255,255,0.16)' : 'transparent',
  textDecoration: 'none',
  fontSize: 14,
})

const SYNC_COLORS: Record<string, string> = {
  off: '#8c8c8c',
  connecting: '#faad14',
  active: '#52c41a',
  error: '#f5222d',
}

function BudgetSwitcher() {
  const { modal } = App.useApp()
  const budgets = useBudgets()
  const current = currentBudget()

  const [nameModal, setNameModal] = useState<null | { mode: 'create' } | { mode: 'rename' }>(null)
  const [name, setName] = useState('')

  const commitName = () => {
    const trimmed = name.trim()
    if (!trimmed || !nameModal) return
    if (nameModal.mode === 'create') {
      switchBudget(createBudget(trimmed).id)
    } else {
      renameBudget(current.id, trimmed)
    }
    setNameModal(null)
  }

  const items = [
    ...budgets.map((b) => ({
      key: b.id,
      label: (
        <span>
          {b.id === current.id && <CheckOutlined style={{ marginRight: 6 }} />}
          {b.name}
        </span>
      ),
      onClick: () => {
        if (b.id !== current.id) switchBudget(b.id)
      },
    })),
    { type: 'divider' as const },
    {
      key: 'new',
      label: 'New Budget…',
      onClick: () => {
        setName('')
        setNameModal({ mode: 'create' })
      },
    },
    {
      key: 'rename',
      label: `Rename “${current.name}”…`,
      onClick: () => {
        setName(current.name)
        setNameModal({ mode: 'rename' })
      },
    },
    ...(budgets.length > 1
      ? [
          {
            key: 'delete',
            label: 'Delete a Budget',
            children: budgets
              .filter((b) => b.id !== current.id)
              .map((b) => ({
                key: `del-${b.id}`,
                danger: true,
                label: b.name,
                onClick: () => {
                  void modal.confirm({
                    title: `Delete "${b.name}"?`,
                    content: 'It is removed from every synced device.',
                    okText: 'Delete',
                    okButtonProps: { danger: true },
                    onOk: () => {
                      deleteBudget(b.id)
                    },
                  })
                },
              })),
          },
        ]
      : []),
  ]

  return (
    <>
      <Dropdown trigger={['click']} menu={{ items }}>
        <span style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <Typography.Title
            level={4}
            style={{
              color: '#fff',
              margin: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {current.name}
          </Typography.Title>
          <DownOutlined style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11 }} />
        </span>
      </Dropdown>
      <Modal
        title={nameModal?.mode === 'create' ? 'New Budget' : 'Rename Budget'}
        open={!!nameModal}
        okText={nameModal?.mode === 'create' ? 'Create & Switch' : 'Save'}
        onOk={commitName}
        onCancel={() => setNameModal(null)}
        destroyOnHidden
      >
        <Input
          autoFocus
          placeholder="Budget name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onPressEnter={commitName}
        />
      </Modal>
    </>
  )
}

export default function Sidebar() {
  const data = useData()
  const syncStatus = useStore((s) => s.syncStatus)
  const syncDetail = useStore((s) => s.syncDetail)
  const [addOpen, setAddOpen] = useState(false)

  const balances = useMemo(() => computeAccountBalances(data.txns), [data.txns])
  const budgetTotal = data.accounts.reduce((sum, a) => sum + (balances[a._id]?.working ?? 0), 0)

  return (
    <Layout.Sider width={264} style={{ background: '#173b33', padding: 12, overflow: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px 16px' }}>
        <WalletOutlined style={{ color: '#7fd6bd', fontSize: 22 }} />
        <BudgetSwitcher />
        <Tooltip title={syncStatus === 'off' ? 'Sync off' : `Sync: ${syncStatus}${syncDetail ? ` — ${syncDetail}` : ''}`}>
          <Badge color={SYNC_COLORS[syncStatus]} style={{ marginLeft: 'auto' }} />
        </Tooltip>
      </div>

      <NavLink to="/budget" style={linkStyle}>
        <span>
          <WalletOutlined style={{ marginRight: 8 }} />
          Budget
        </span>
      </NavLink>
      <NavLink to="/account/all" style={linkStyle}>
        <span>All Accounts</span>
      </NavLink>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '18px 12px 6px',
          color: 'rgba(255,255,255,0.5)',
          fontSize: 11,
          letterSpacing: 1,
        }}
      >
        <span>ACCOUNTS</span>
        <span>{fmtMoney(budgetTotal)}</span>
      </div>

      {data.accounts.map((a) => {
        const bal = balances[a._id]?.working ?? 0
        return (
          <NavLink key={a._id} to={`/account/${a._id.slice(5)}`} style={linkStyle}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {a.accountType === 'credit' && <CreditCardOutlined style={{ marginRight: 6 }} />}
              {a.name}
            </span>
            <span
              style={{
                fontVariantNumeric: 'tabular-nums',
                color: bal < 0 ? '#ff9c9c' : undefined,
              }}
            >
              {fmtMoney(bal)}
            </span>
          </NavLink>
        )
      })}

      <Button
        ghost
        size="small"
        icon={<PlusOutlined />}
        style={{ margin: '10px 8px', borderStyle: 'dashed' }}
        onClick={() => setAddOpen(true)}
      >
        Add Account
      </Button>

      <div style={{ marginTop: 24 }}>
        <NavLink to="/settings" style={linkStyle}>
          <span>
            <SettingOutlined style={{ marginRight: 8 }} />
            Settings
          </span>
        </NavLink>
      </div>

      <AccountModal open={addOpen} onClose={() => setAddOpen(false)} />
    </Layout.Sider>
  )
}
