import { Suspense, lazy, useEffect } from 'react'
import { initApp, useStore } from './store'
import { useIsMobile } from './useMedia'

const DesktopApp = lazy(() => import('./desktop/DesktopApp'))
const MobileApp = lazy(() => import('./mobile/MobileApp'))

const loading = (
  <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
    <div
      style={{
        width: 26,
        height: 26,
        border: '2.5px solid rgba(53, 195, 154, 0.25)',
        borderTopColor: '#35c39a',
        borderRadius: '50%',
        animation: 'splash-spin 0.8s linear infinite',
      }}
    />
  </div>
)

// Mounts only once Suspense has resolved, i.e. the real UI is in the DOM —
// then fades out the index.html splash overlay.
function SplashRemover() {
  useEffect(() => {
    const el = document.getElementById('splash')
    if (!el) return
    el.classList.add('splash-hide')
    el.addEventListener('transitionend', () => el.remove(), { once: true })
    const fallback = setTimeout(() => el.remove(), 500)
    return () => clearTimeout(fallback)
  }, [])
  return null
}

export default function App() {
  const ready = useStore((s) => s.ready)
  const isMobile = useIsMobile()

  useEffect(() => {
    void initApp()
  }, [])

  if (!ready) return loading

  return (
    <Suspense fallback={loading}>
      {isMobile ? <MobileApp /> : <DesktopApp />}
      <SplashRemover />
    </Suspense>
  )
}
