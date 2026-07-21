import { useRef, useState } from 'react'
import { App, Button, Card, Divider, Form, Input, Space, Switch, Typography } from 'antd'
import { CloudSyncOutlined, DownloadOutlined, UploadOutlined, UserOutlined } from '@ant-design/icons'
import { loadSyncSettings, saveSyncSettings, startSync, type SyncSettings } from '../db'
import { isSignedIn } from '../syncSettings'
import { api } from '../api'
import { setSyncStatus, useStore } from '../store'
import { exportBackup, importBackup } from '../backup'

export default function SettingsPage() {
  const { message } = App.useApp()
  const [settings, setSettings] = useState<SyncSettings>(loadSyncSettings)
  const syncStatus = useStore((s) => s.syncStatus)
  const syncDetail = useStore((s) => s.syncDetail)
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
      message.success(`Signed in as ${acct.email}`)
    } catch (err) {
      message.error(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const signOut = () => {
    void api.logout(settings.url, settings.token).catch(() => {})
    apply({ url: settings.url, token: '', enabled: false })
  }

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: 24 }}>
      <Typography.Title level={3}>Settings</Typography.Title>

      <Card
        title={
          <span>
            <CloudSyncOutlined /> Sync &amp; Account
          </span>
        }
        extra={<span style={{ color: '#888' }}>status: {syncStatus}</span>}
        style={{ marginBottom: 24 }}
      >
        <Typography.Paragraph type="secondary">
          Optional. Point at the sync Worker (deployed with <code>npm run deploy</code> from
          this project) and sign in to live-sync between devices and share budgets with
          other accounts. The app is fully usable offline; edits merge field-by-field when
          you reconnect.
        </Typography.Paragraph>
        <Form layout="vertical">
          <Form.Item
            label="Server URL"
            extra={
              location.protocol === 'https:'
                ? `If this app is served by the sync Worker, use wss://${location.host}`
                : undefined
            }
          >
            <Input
              value={settings.url}
              placeholder="wss://sync.example.com"
              onChange={(e) => setSettings({ ...settings, url: e.target.value })}
            />
          </Form.Item>

          {isSignedIn(settings) ? (
            <Space>
              <Typography.Text>
                <UserOutlined /> Signed in as <b>{settings.email}</b>
              </Typography.Text>
              <Button onClick={signOut}>Sign Out</Button>
              <Switch
                checked={settings.enabled}
                checkedChildren="on"
                unCheckedChildren="off"
                onChange={(enabled) => apply({ ...settings, enabled })}
              />
            </Space>
          ) : (
            <>
              <Form.Item label="Email">
                <Input
                  value={email}
                  autoComplete="email"
                  placeholder="you@example.com"
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Form.Item>
              <Form.Item label="Password" extra="At least 8 characters">
                <Input.Password
                  value={password}
                  autoComplete="current-password"
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Form.Item>
              <Space>
                <Button
                  type="primary"
                  loading={busy}
                  disabled={!settings.url || !email || !password}
                  onClick={() => void auth('login')}
                >
                  Sign In
                </Button>
                <Button
                  loading={busy}
                  disabled={!settings.url || !email || !password}
                  onClick={() => void auth('signup')}
                >
                  Create Account
                </Button>
              </Space>

              <Divider plain style={{ margin: '16px 0 8px' }}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  or use a legacy shared token
                </Typography.Text>
              </Divider>
              <Space.Compact block>
                <Input.Password
                  value={settings.userId ? '' : settings.token}
                  placeholder="Access token"
                  autoComplete="new-password"
                  onChange={(e) => setSettings({ ...settings, token: e.target.value })}
                />
                <Button
                  disabled={!settings.url}
                  onClick={() => apply({ ...settings, enabled: true })}
                >
                  Connect
                </Button>
              </Space.Compact>
            </>
          )}
          {syncDetail && (
            <Typography.Paragraph type="danger" style={{ marginTop: 12 }}>
              {syncDetail}
            </Typography.Paragraph>
          )}
        </Form>
      </Card>

      <Card title="Backup">
        <Space>
          <Button icon={<DownloadOutlined />} onClick={() => void exportBackup()}>
            Export JSON
          </Button>
          <Button icon={<UploadOutlined />} onClick={() => fileRef.current?.click()}>
            Import JSON
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) {
                importBackup(file)
                  .then((n) => message.success(`Imported ${n} records`))
                  .catch((err) => message.error(String(err)))
              }
              e.target.value = ''
            }}
          />
        </Space>
      </Card>
    </div>
  )
}
