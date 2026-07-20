import { useRef, useState } from 'react'
import { App, Button, Card, Form, Input, Space, Switch, Typography } from 'antd'
import { CloudSyncOutlined, DownloadOutlined, UploadOutlined } from '@ant-design/icons'
import { loadSyncSettings, saveSyncSettings, startSync, type SyncSettings } from '../db'
import { setSyncStatus, useStore } from '../store'
import { exportBackup, importBackup } from '../backup'

export default function SettingsPage() {
  const { message } = App.useApp()
  const [settings, setSettings] = useState<SyncSettings>(loadSyncSettings)
  const syncStatus = useStore((s) => s.syncStatus)
  const syncDetail = useStore((s) => s.syncDetail)
  const fileRef = useRef<HTMLInputElement>(null)

  const apply = (next: SyncSettings) => {
    setSettings(next)
    saveSyncSettings(next)
    startSync(next, setSyncStatus)
  }

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: 24 }}>
      <Typography.Title level={3}>Settings</Typography.Title>

      <Card
        title={
          <span>
            <CloudSyncOutlined /> Device Sync
          </span>
        }
        extra={<span style={{ color: '#888' }}>status: {syncStatus}</span>}
        style={{ marginBottom: 24 }}
      >
        <Typography.Paragraph type="secondary">
          Optional. Point at the sync Worker (deployed with <code>npm run deploy</code> from
          this project) to live-sync between devices. The app is fully usable offline; edits
          merge field-by-field when you reconnect.
        </Typography.Paragraph>
        <Form layout="vertical" onFinish={() => apply({ ...settings, enabled: true })}>
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
          <Form.Item label="Access Token">
            <Input.Password
              value={settings.token}
              autoComplete="new-password"
              onChange={(e) => setSettings({ ...settings, token: e.target.value })}
            />
          </Form.Item>
          <Space>
            <Button type="primary" htmlType="submit" disabled={!settings.url}>
              Save & Connect
            </Button>
            <Switch
              checked={settings.enabled}
              checkedChildren="on"
              unCheckedChildren="off"
              onChange={(enabled) => apply({ ...settings, enabled })}
            />
          </Space>
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
