import { useRef, useState } from 'react'
import { Check, Download, Pencil, Share2, Trash2, Upload } from 'lucide-react'
import { loadSyncSettings, saveSyncSettings, startSync, type SyncSettings } from '../db'
import { isSignedIn } from '../syncSettings'
import { api } from '../api'
import { setSyncStatus, useStore } from '../store'
import { exportBackup, importBackup } from '../backup'
import {
  createBudget,
  createInvite,
  currentBudget,
  deleteBudget,
  joinSharedBudget,
  renameBudget,
  switchBudget,
  useBudgets,
  type BudgetMeta,
} from '../budgets'
import Sheet from './ui/Sheet'
import SwipeRow from './ui/SwipeRow'
import { toast } from './ui/Toast'
import { alertDialog, confirmDialog } from './ui/Dialog'
import {
  Card,
  Divided,
  GhostButton,
  PrimaryButton,
  SectionLabel,
  Switch,
  inputCls,
} from './ui/controls'

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))

function BudgetsSection({ signedIn }: { signedIn: boolean }) {
  const budgets = useBudgets()
  const current = currentBudget()

  // null = closed; {mode:'create'}, {mode:'rename', budget} or {mode:'join'}
  const [sheet, setSheet] = useState<
    null | { mode: 'create' } | { mode: 'rename'; budget: BudgetMeta } | { mode: 'join' }
  >(null)
  const [name, setName] = useState('')

  const commit = () => {
    const trimmed = name.trim()
    if (!trimmed || !sheet) return
    if (sheet.mode === 'create') {
      void createBudget(trimmed).then((b) => switchBudget(b.id))
    } else if (sheet.mode === 'join') {
      joinSharedBudget(trimmed)
        .then((b) => switchBudget(b.id))
        .catch((e) => toast(errText(e)))
      return
    } else {
      renameBudget(sheet.budget.id, trimmed)
    }
    setSheet(null)
  }

  const share = (b: BudgetMeta) => {
    createInvite(b)
      .then((code) =>
        alertDialog({
          title: `Share “${b.name}”`,
          message: (
            <div>
              <div className="mb-3">Others join with this invite code (valid 7 days):</div>
              <div className="font-mono text-[24px] font-bold tracking-[0.2em] text-fg">{code}</div>
            </div>
          ),
        }),
      )
      .catch((e) => toast(errText(e)))
  }

  return (
    <>
      <SectionLabel>Budgets</SectionLabel>
      <Card>
        <Divided>
          {budgets.map((b) => {
            const isCurrent = b.id === current.id
            return (
              <SwipeRow
                key={b.id}
                right={[
                  {
                    key: 'rename',
                    label: 'Rename',
                    icon: <Pencil size={17} />,
                    tone: 'accent',
                    onPress: () => {
                      setName(b.name)
                      setSheet({ mode: 'rename', budget: b })
                    },
                  },
                  ...(signedIn
                    ? [
                        {
                          key: 'share',
                          label: 'Share',
                          icon: <Share2 size={17} />,
                          tone: 'warn' as const,
                          onPress: () => share(b),
                        },
                      ]
                    : []),
                  ...(isCurrent
                    ? []
                    : [
                        {
                          key: 'delete',
                          label: 'Delete',
                          icon: <Trash2 size={17} />,
                          tone: 'danger' as const,
                          onPress: () => {
                            void confirmDialog({
                              title: `Delete "${b.name}"?`,
                              message: 'It is removed from every synced device.',
                              confirmText: 'Delete',
                              danger: true,
                            }).then((ok) => {
                              if (ok) {
                                deleteBudget(b.id)
                                toast('Budget deleted')
                              }
                            })
                          },
                        },
                      ]),
                ]}
                onTap={() => {
                  if (!isCurrent) switchBudget(b.id)
                }}
              >
                <div className="flex items-center gap-3 px-4 py-3.5">
                  <Check
                    size={18}
                    className={isCurrent ? 'text-mint' : 'invisible'}
                    aria-hidden={!isCurrent}
                  />
                  <span className="text-[15px] font-medium">{b.name}</span>
                </div>
              </SwipeRow>
            )
          })}
          <button
            className="w-full px-4 py-3.5 text-left text-[15px] font-semibold text-mint active:bg-raised"
            onClick={() => {
              setName('')
              setSheet({ mode: 'create' })
            }}
          >
            + New budget
          </button>
          {signedIn && (
            <button
              className="w-full px-4 py-3.5 text-left text-[15px] font-semibold text-mint active:bg-raised"
              onClick={() => {
                setName('')
                setSheet({ mode: 'join' })
              }}
            >
              + Join shared budget
            </button>
          )}
        </Divided>
      </Card>

      <Sheet
        open={!!sheet}
        onClose={() => setSheet(null)}
        title={
          sheet?.mode === 'create'
            ? 'New budget'
            : sheet?.mode === 'join'
              ? 'Join shared budget'
              : 'Rename budget'
        }
      >
        {sheet && (
          <div>
            <input
              autoFocus
              placeholder={sheet.mode === 'join' ? 'Invite code' : 'Budget name'}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && commit()}
              className={`${inputCls} mb-4`}
            />
            <PrimaryButton onClick={commit}>
              {sheet.mode === 'create' ? 'Create & switch' : sheet.mode === 'join' ? 'Join' : 'Save'}
            </PrimaryButton>
          </div>
        )}
      </Sheet>
    </>
  )
}

export default function SettingsTab() {
  const [settings, setSettings] = useState<SyncSettings>(loadSyncSettings)
  const syncStatus = useStore((s) => s.syncStatus)
  const fileRef = useRef<HTMLInputElement>(null)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  const apply = (next: SyncSettings) => {
    setSettings(next)
    saveSyncSettings(next)
    startSync(next, setSyncStatus)
  }

  const auth = async (mode: 'login' | 'signup') => {
    setBusy(true)
    try {
      const fn = mode === 'login' ? api.login : api.signup
      const acct = await fn(settings.url, email.trim(), password)
      apply({
        url: settings.url,
        token: acct.token,
        email: acct.email,
        userId: acct.userId,
        enabled: true,
      })
      setPassword('')
      toast(`Signed in as ${acct.email}`)
    } catch (e) {
      toast(errText(e))
    } finally {
      setBusy(false)
    }
  }

  const signOut = () => {
    void api.logout(settings.url, settings.token).catch(() => {})
    apply({ url: settings.url, token: '', enabled: false })
  }

  const signedIn = isSignedIn(settings)
  const statusTone =
    syncStatus === 'active' ? 'bg-mint' : syncStatus === 'error' ? 'bg-loss' : 'bg-faint'

  return (
    <div>
      <header className="px-5 pt-4 pb-1">
        <h1 className="text-[22px] font-bold">Settings</h1>
      </header>

      <BudgetsSection signedIn={signedIn} />

      <SectionLabel
        extra={
          <span className="flex items-center gap-1.5 text-[12px] text-mute">
            <span className={`h-1.5 w-1.5 rounded-full ${statusTone}`} />
            {syncStatus}
          </span>
        }
      >
        Sync & account
      </SectionLabel>
      <Card>
        <div className="grid gap-3 p-4">
          <input
            placeholder="wss://sync.example.com"
            value={settings.url}
            onChange={(e) => setSettings({ ...settings, url: e.target.value })}
            className={inputCls}
          />
          {signedIn ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-[14px] text-mute">
                  Signed in as <span className="text-fg">{settings.email}</span>
                </span>
                <button
                  className="shrink-0 rounded-lg bg-raised px-3 py-1.5 text-[13px] font-semibold text-fg active:scale-95"
                  onClick={signOut}
                >
                  Sign out
                </button>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[14px] text-mute">Sync enabled</span>
                <Switch
                  checked={settings.enabled}
                  onChange={(enabled) => apply({ ...settings, enabled })}
                />
              </div>
            </>
          ) : (
            <>
              <input
                placeholder="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputCls}
              />
              <input
                placeholder="Password (8+ characters)"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputCls}
              />
              <div className="flex gap-2.5">
                <PrimaryButton
                  disabled={busy || !settings.url || !email || !password}
                  onClick={() => void auth('login')}
                >
                  {busy ? 'Working…' : 'Sign in'}
                </PrimaryButton>
                <GhostButton
                  disabled={busy || !settings.url || !email || !password}
                  onClick={() => void auth('signup')}
                >
                  Create account
                </GhostButton>
              </div>
              <div className="mt-1 border-t border-line pt-3">
                <div className="mb-2 text-[12px] text-faint">
                  Legacy shared token — only needed for pre-account setups
                </div>
                <input
                  placeholder="Legacy shared token (optional)"
                  type="password"
                  value={settings.userId ? '' : settings.token}
                  onChange={(e) => setSettings({ ...settings, token: e.target.value })}
                  className={`${inputCls} mb-2.5`}
                />
                <GhostButton
                  disabled={!settings.url}
                  onClick={() => apply({ ...settings, enabled: true })}
                >
                  Connect with token
                </GhostButton>
              </div>
            </>
          )}
        </div>
      </Card>

      <SectionLabel>Backup</SectionLabel>
      <Card>
        <Divided>
          <button
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-[15px] font-medium active:bg-raised"
            onClick={() => void exportBackup()}
          >
            <Download size={18} className="text-mute" />
            Export JSON backup
          </button>
          <button
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-[15px] font-medium active:bg-raised"
            onClick={() => fileRef.current?.click()}
          >
            <Upload size={18} className="text-mute" />
            Import JSON backup
          </button>
        </Divided>
      </Card>

      <input
        ref={fileRef}
        type="file"
        accept="application/json"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) {
            importBackup(file)
              .then((n) => toast(`Imported ${n} records`))
              .catch((err) => toast(String(err)))
          }
          e.target.value = ''
        }}
      />
    </div>
  )
}
