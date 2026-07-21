// HTTP client for the worker's account/membership API (see worker.js).
// The sync URL is a ws(s):// address; API calls go to the same host over http(s).

export interface Account {
  token: string
  userId: string
  email: string
}

export interface ServerBudget {
  room: string
  name: string
  members: number
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

function httpBase(url: string): string {
  return url.trim().replace(/^ws/i, 'http').replace(/\/+$/, '')
}

async function call<T>(
  url: string,
  token: string | null,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(httpBase(url) + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new ApiError(res.status, data.error ?? `HTTP ${res.status}`)
  return data as T
}

export const api = {
  signup: (url: string, email: string, password: string) =>
    call<Account>(url, null, 'POST', '/api/signup', { email, password }),
  login: (url: string, email: string, password: string) =>
    call<Account>(url, null, 'POST', '/api/login', { email, password }),
  logout: (url: string, token: string) => call<{ ok: boolean }>(url, token, 'POST', '/api/logout'),
  budgets: (url: string, token: string) =>
    call<{ budgets: ServerBudget[] }>(url, token, 'GET', '/api/budgets').then((r) => r.budgets),
  registerBudget: (url: string, token: string, room: string, name: string) =>
    call<{ room: string; name: string }>(url, token, 'POST', '/api/budgets', { room, name }),
  renameBudget: (url: string, token: string, room: string, name: string) =>
    call<{ room: string; name: string }>(url, token, 'PATCH', `/api/budgets/${room}`, { name }),
  deleteBudget: (url: string, token: string, room: string) =>
    call<{ ok: boolean; purged: boolean }>(url, token, 'DELETE', `/api/budgets/${room}`),
  createInvite: (url: string, token: string, room: string) =>
    call<{ code: string; expires: number }>(url, token, 'POST', `/api/budgets/${room}/invite`),
  join: (url: string, token: string, code: string) =>
    call<{ room: string; name: string }>(url, token, 'POST', '/api/join', { code }),
}
