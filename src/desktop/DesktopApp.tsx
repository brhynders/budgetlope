import { App as AntApp, ConfigProvider, Layout } from 'antd'
import { Navigate, Route, Routes } from 'react-router-dom'
import Sidebar from './Sidebar'
import BudgetPage from './BudgetPage'
import RegisterPage from './RegisterPage'
import SettingsPage from './SettingsPage'

export default function DesktopApp() {
  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#1a7f64',
          borderRadius: 8,
        },
      }}
    >
      <AntApp style={{ height: '100%' }}>
        <Layout style={{ height: '100%' }}>
          <Sidebar />
          <Layout.Content style={{ overflow: 'auto', background: '#fff' }}>
            <Routes>
              <Route path="/budget" element={<BudgetPage />} />
              <Route path="/account/:id" element={<RegisterPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/budget" replace />} />
            </Routes>
          </Layout.Content>
        </Layout>
      </AntApp>
    </ConfigProvider>
  )
}
