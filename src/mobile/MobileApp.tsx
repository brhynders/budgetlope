import { ConfigProvider, TabBar, setDefaultConfig } from 'antd-mobile'
import enUS from 'antd-mobile/es/locales/en-US'

// ConfigProvider doesn't reach imperative components (Dialog.confirm, Toast)
setDefaultConfig({ locale: enUS })
import { AppOutline, BillOutline, SetOutline } from 'antd-mobile-icons'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import BudgetTab from './BudgetTab'
import AccountsTab from './AccountsTab'
import RegisterScreen from './RegisterScreen'
import SettingsTab from './SettingsTab'

export default function MobileApp() {
  const location = useLocation()
  const navigate = useNavigate()

  const activeKey = location.pathname.startsWith('/account')
    ? '/accounts'
    : location.pathname.startsWith('/settings')
      ? '/settings'
      : '/budget'

  return (
    <ConfigProvider locale={enUS}>
    <div className="m-screen">
      <div className="m-body">
        <Routes>
          <Route path="/budget" element={<BudgetTab />} />
          <Route path="/accounts" element={<AccountsTab />} />
          <Route path="/account/:id" element={<RegisterScreen />} />
          <Route path="/settings" element={<SettingsTab />} />
          <Route path="*" element={<Navigate to="/budget" replace />} />
        </Routes>
      </div>
      <TabBar
        className="m-tabbar"
        activeKey={activeKey}
        onChange={(key) => navigate(key)}
        safeArea
      >
        <TabBar.Item key="/budget" title="Budget" icon={<AppOutline />} />
        <TabBar.Item key="/accounts" title="Accounts" icon={<BillOutline />} />
        <TabBar.Item key="/settings" title="Settings" icon={<SetOutline />} />
      </TabBar>
    </div>
    </ConfigProvider>
  )
}
