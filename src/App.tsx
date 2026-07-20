import { Suspense, lazy, useEffect } from 'react'
import { Spin } from 'antd'
import { initApp, useStore } from './store'
import { useIsMobile } from './useMedia'

const DesktopApp = lazy(() => import('./desktop/DesktopApp'))
const MobileApp = lazy(() => import('./mobile/MobileApp'))

const loading = (
  <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
    <Spin size="large" />
  </div>
)

export default function App() {
  const ready = useStore((s) => s.ready)
  const isMobile = useIsMobile()

  useEffect(() => {
    void initApp()
  }, [])

  if (!ready) return loading

  return <Suspense fallback={loading}>{isMobile ? <MobileApp /> : <DesktopApp />}</Suspense>
}
