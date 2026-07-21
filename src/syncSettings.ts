export interface SyncSettings {
  url: string
  token: string
  enabled: boolean
  /** Present when `token` is an account session (multi-user mode) rather than a legacy shared token. */
  userId?: string
  email?: string
}

const SYNC_KEY = 'budgetlope.sync'

export function loadSyncSettings(): SyncSettings {
  try {
    const raw = localStorage.getItem(SYNC_KEY)
    if (raw) {
      const p = JSON.parse(raw) as Partial<SyncSettings>
      return {
        url: p.url ?? '',
        token: p.token ?? '',
        enabled: !!p.enabled,
        userId: p.userId,
        email: p.email,
      }
    }
  } catch {
    // fall through to defaults
  }
  return { url: '', token: '', enabled: false }
}

export function saveSyncSettings(s: SyncSettings): void {
  localStorage.setItem(SYNC_KEY, JSON.stringify(s))
}

/** Multi-user mode: an account session is present. */
export function isSignedIn(s: SyncSettings): boolean {
  return !!(s.url && s.token && s.userId)
}
