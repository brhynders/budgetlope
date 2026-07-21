import { useRef, useState } from 'react'
import { Button, Dialog, Input, List, NavBar, Popup, SwipeAction, Switch, Toast } from 'antd-mobile'
import { CheckOutline } from 'antd-mobile-icons'
import { loadSyncSettings, saveSyncSettings, startSync, type SyncSettings } from '../db'
import { setSyncStatus, useStore } from '../store'
import { exportBackup, importBackup } from '../backup'
import {
  createBudget,
  currentBudget,
  deleteBudget,
  renameBudget,
  switchBudget,
  useBudgets,
  type BudgetMeta,
} from '../budgets'

const sheetBody: React.CSSProperties = {
  borderTopLeftRadius: 16,
  borderTopRightRadius: 16,
  padding: '20px 20px calc(20px + env(safe-area-inset-bottom))',
}

function BudgetsSection() {
  const budgets = useBudgets()
  const current = currentBudget()

  // null = closed; {mode:'create'} or {mode:'rename', budget}
  const [sheet, setSheet] = useState<null | { mode: 'create' } | { mode: 'rename'; budget: BudgetMeta }>(null)
  const [name, setName] = useState('')

  const commit = () => {
    const trimmed = name.trim()
    if (!trimmed || !sheet) return
    if (sheet.mode === 'create') {
      switchBudget(createBudget(trimmed).id)
    } else {
      renameBudget(sheet.budget.id, trimmed)
    }
    setSheet(null)
  }

  return (
    <>
      <List header="Budgets">
        {budgets.map((b) => {
          const isCurrent = b.id === current.id
          return (
            <SwipeAction
              key={b.id}
              rightActions={[
                { key: 'rename', text: 'Rename', color: 'primary' },
                ...(isCurrent ? [] : [{ key: 'delete', text: 'Delete', color: 'danger' as const }]),
              ]}
              onAction={(action) => {
                if (action.key === 'rename') {
                  setName(b.name)
                  setSheet({ mode: 'rename', budget: b })
                } else if (action.key === 'delete') {
                  void Dialog.confirm({
                    content: `Delete "${b.name}"? It is removed from every synced device.`,
                    confirmText: 'Delete',
                  }).then((ok) => {
                    if (ok) {
                      deleteBudget(b.id)
                      Toast.show('Budget deleted')
                    }
                  })
                }
              }}
            >
              <List.Item
                clickable
                arrowIcon={false}
                prefix={
                  <CheckOutline
                    style={{ visibility: isCurrent ? 'visible' : 'hidden', color: '#1a7f64' }}
                  />
                }
                onClick={() => {
                  if (!isCurrent) switchBudget(b.id)
                }}
              >
                {b.name}
              </List.Item>
            </SwipeAction>
          )
        })}
        <List.Item
          clickable
          onClick={() => {
            setName('')
            setSheet({ mode: 'create' })
          }}
        >
          <span style={{ color: '#1a7f64', fontWeight: 600 }}>+ New Budget</span>
        </List.Item>
      </List>

      <Popup
        visible={!!sheet}
        onMaskClick={() => setSheet(null)}
        position="bottom"
        bodyStyle={sheetBody}
      >
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 16 }}>
          {sheet?.mode === 'create' ? 'New Budget' : 'Rename Budget'}
        </div>
        <div
          style={{
            border: '1px solid #ddd',
            borderRadius: 10,
            padding: '10px 12px',
            marginBottom: 16,
          }}
        >
          <Input
            autoFocus
            placeholder="Budget name"
            value={name}
            onChange={setName}
            onEnterPress={commit}
          />
        </div>
        <Button block color="primary" size="large" onClick={commit}>
          {sheet?.mode === 'create' ? 'Create & Switch' : 'Save'}
        </Button>
      </Popup>
    </>
  )
}

export default function SettingsTab() {
  const [settings, setSettings] = useState<SyncSettings>(loadSyncSettings)
  const syncStatus = useStore((s) => s.syncStatus)
  const fileRef = useRef<HTMLInputElement>(null)

  const apply = (next: SyncSettings) => {
    setSettings(next)
    saveSyncSettings(next)
    startSync(next, setSyncStatus)
  }

  return (
    <div>
      <NavBar back={null}>Settings</NavBar>

      <BudgetsSection />

      <List header={`Device Sync — status: ${syncStatus}`} style={{ marginTop: 12 }}>
        <List.Item>
          <Input
            placeholder="wss://sync.example.com"
            value={settings.url}
            onChange={(url) => setSettings({ ...settings, url })}
          />
        </List.Item>
        <List.Item>
          <Input
            placeholder="Access token"
            type="password"
            value={settings.token}
            onChange={(token) => setSettings({ ...settings, token })}
          />
        </List.Item>
        <List.Item
          extra={
            <Switch
              checked={settings.enabled}
              onChange={(enabled) => apply({ ...settings, enabled })}
            />
          }
        >
          Sync enabled
        </List.Item>
        <List.Item>
          <Button
            block
            color="primary"
            disabled={!settings.url}
            onClick={() => apply({ ...settings, enabled: true })}
          >
            Save & Connect
          </Button>
        </List.Item>
      </List>

      <List header="Backup" style={{ marginTop: 12 }}>
        <List.Item clickable onClick={() => void exportBackup()}>
          Export JSON backup
        </List.Item>
        <List.Item clickable onClick={() => fileRef.current?.click()}>
          Import JSON backup
        </List.Item>
      </List>
      <input
        ref={fileRef}
        type="file"
        accept="application/json"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) {
            importBackup(file)
              .then((n) => Toast.show(`Imported ${n} records`))
              .catch((err) => Toast.show(String(err)))
          }
          e.target.value = ''
        }}
      />
    </div>
  )
}
