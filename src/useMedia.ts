import { useSyncExternalStore } from 'react'

const QUERY = '(max-width: 767px)'

function subscribe(cb: () => void): () => void {
  const mql = window.matchMedia(QUERY)
  mql.addEventListener('change', cb)
  return () => mql.removeEventListener('change', cb)
}

export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches)
}
