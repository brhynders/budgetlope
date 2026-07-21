import { Landmark, Mail, Settings } from 'lucide-react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import BudgetTab from './BudgetTab'
import AccountsTab from './AccountsTab'
import RegisterScreen from './RegisterScreen'
import SettingsTab from './SettingsTab'
import { ToastHost } from './ui/Toast'
import { DialogHost } from './ui/Dialog'

const TABS = [
  { key: '/budget', label: 'Budget', Icon: Mail },
  { key: '/accounts', label: 'Accounts', Icon: Landmark },
  { key: '/settings', label: 'Settings', Icon: Settings },
]

export default function MobileApp() {
  const location = useLocation()
  const navigate = useNavigate()

  const activeKey = location.pathname.startsWith('/account')
    ? '/accounts'
    : location.pathname.startsWith('/settings')
      ? '/settings'
      : '/budget'

  return (
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

      <nav className="pb-safe flex border-t border-line bg-ink/90 backdrop-blur-lg">
        {TABS.map(({ key, label, Icon }) => {
          const active = key === activeKey
          return (
            <button
              key={key}
              onClick={() => navigate(key)}
              className={`flex flex-1 flex-col items-center gap-1 pt-2.5 pb-2 transition-colors ${
                active ? 'text-mint' : 'text-faint active:text-mute'
              }`}
            >
              <Icon size={22} strokeWidth={active ? 2.2 : 1.8} />
              <span className="text-[10px] font-semibold">{label}</span>
            </button>
          )
        })}
      </nav>

      <ToastHost />
      <DialogHost />
    </div>
  )
}
