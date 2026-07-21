// Budgetlope sync on Cloudflare Workers + Durable Objects.
// One Durable Object per budget document; speaks the standard y-websocket
// protocol. Uses the WebSocket hibernation API, so idle connections cost
// nothing; the Y.Doc is rebuilt from storage on wake.
//
// Multi-user: a singleton Directory DO keeps accounts, sessions, budget
// membership and invite codes in SQLite. Budget rooms registered there are
// only reachable by their members; unregistered rooms keep the original
// single shared SYNC_TOKEN behavior so pre-account devices continue to work.
import * as Y from 'yjs'
import * as syncProtocol from 'y-protocols/sync.js'
import * as encoding from 'lib0/encoding.js'
import * as decoding from 'lib0/decoding.js'

const MSG_SYNC = 0
const MSG_AWARENESS = 1

const ROOM_RE = /^[a-zA-Z0-9_-]{1,64}$/

// Storage layout: the doc snapshot lives in chunked keys doc:000000, doc:000001…
// (kept under the per-value size limit); incremental updates append to u:* keys
// and get folded into the snapshot every COMPACT_AFTER updates.
const CHUNK = 100_000
const COMPACT_AFTER = 64

export class YDocRoom {
  constructor(ctx) {
    this.ctx = ctx
    this.doc = null
    this.pending = 0
    this.seq = 0
  }

  async ensureDoc() {
    if (this.doc) return
    const doc = new Y.Doc()

    const snapshot = await this.ctx.storage.list({ prefix: 'doc:' })
    if (snapshot.size > 0) {
      const parts = [...snapshot.values()].map((v) => new Uint8Array(v))
      const merged = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
      let offset = 0
      for (const p of parts) {
        merged.set(p, offset)
        offset += p.length
      }
      Y.applyUpdate(doc, merged)
    }
    const updates = await this.ctx.storage.list({ prefix: 'u:' })
    for (const u of updates.values()) Y.applyUpdate(doc, new Uint8Array(u))
    this.pending = updates.size

    doc.on('update', (update) => {
      const encoder = encoding.createEncoder()
      encoding.writeVarUint(encoder, MSG_SYNC)
      syncProtocol.writeUpdate(encoder, update)
      this.broadcast(encoding.toUint8Array(encoder))
      this.persist(update).catch((err) => console.error('persist failed:', err))
    })
    this.doc = doc
  }

  broadcast(data, exclude) {
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === exclude) continue
      try {
        ws.send(data)
      } catch {
        // socket is closing
      }
    }
  }

  async persist(update) {
    if (update.length > CHUNK || this.pending + 1 >= COMPACT_AFTER) {
      await this.compact()
    } else {
      this.pending++
      this.seq++
      await this.ctx.storage.put(`u:${Date.now().toString(36)}-${this.seq}`, update)
    }
  }

  async compact() {
    const merged = Y.encodeStateAsUpdate(this.doc)
    const chunkCount = Math.max(1, Math.ceil(merged.length / CHUNK))
    const puts = {}
    for (let i = 0; i < chunkCount; i++) {
      puts[`doc:${String(i).padStart(6, '0')}`] = merged.slice(i * CHUNK, (i + 1) * CHUNK)
    }
    await this.ctx.storage.put(puts)

    const oldSnapshot = await this.ctx.storage.list({ prefix: 'doc:' })
    const staleChunks = [...oldSnapshot.keys()].filter((k) => Number(k.slice(4)) >= chunkCount)
    const updates = await this.ctx.storage.list({ prefix: 'u:' })
    const doomed = [...updates.keys(), ...staleChunks]
    for (let i = 0; i < doomed.length; i += 128) {
      await this.ctx.storage.delete(doomed.slice(i, i + 128))
    }
    this.pending = 0
  }

  async fetch(request) {
    if (request.method === 'DELETE' && new URL(request.url).pathname === '/purge') {
      // Only the Directory DO can reach this — the worker routes nothing but
      // websocket upgrades to budget rooms
      for (const ws of this.ctx.getWebSockets()) ws.close(1000, 'budget deleted')
      await this.ctx.storage.deleteAll()
      this.doc = null
      this.pending = 0
      return new Response(null, { status: 204 })
    }
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 })
    }
    const pair = new WebSocketPair()
    this.ctx.acceptWebSocket(pair[1])
    await this.ensureDoc()

    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MSG_SYNC)
    syncProtocol.writeSyncStep1(encoder, this.doc)
    pair[1].send(encoding.toUint8Array(encoder))

    return new Response(null, { status: 101, webSocket: pair[0] })
  }

  async webSocketMessage(ws, message) {
    if (typeof message === 'string') return
    await this.ensureDoc()
    const data = new Uint8Array(message)
    const decoder = decoding.createDecoder(data)
    const type = decoding.readVarUint(decoder)
    if (type === MSG_SYNC) {
      const encoder = encoding.createEncoder()
      encoding.writeVarUint(encoder, MSG_SYNC)
      syncProtocol.readSyncMessage(decoder, encoder, this.doc, ws)
      if (encoding.length(encoder) > 1) ws.send(encoding.toUint8Array(encoder))
    } else if (type === MSG_AWARENESS) {
      // Presence is ephemeral gossip — relay without keeping server state
      this.broadcast(data, ws)
    }
  }

  webSocketClose() {}
  webSocketError() {}
}

// ---------------------------------------------------------------------------
// Directory: accounts, sessions, budget membership, invites

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000
// No ambiguous 0/O/1/I/L characters — codes get read out loud
const INVITE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
const err = (status, message) => json({ error: message }, status)

const toHex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
const fromHex = (hex) => new Uint8Array(hex.match(/../g).map((h) => parseInt(h, 16)))

const inviteCode = () =>
  [...crypto.getRandomValues(new Uint8Array(8))]
    .map((b) => INVITE_ALPHABET[b % INVITE_ALPHABET.length])
    .join('')

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    256,
  )
  return toHex(new Uint8Array(bits))
}

export class Directory {
  constructor(ctx, env) {
    this.env = env
    this.sql = ctx.storage.sql
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, pass TEXT NOT NULL, created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS budgets (room TEXT PRIMARY KEY, name TEXT NOT NULL, created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS members (room TEXT NOT NULL, user_id TEXT NOT NULL, PRIMARY KEY (room, user_id));
      CREATE TABLE IF NOT EXISTS invites (code TEXT PRIMARY KEY, room TEXT NOT NULL, created_by TEXT NOT NULL, expires INTEGER NOT NULL);
    `)
  }

  // Free-plan CPU limits can make 100k iterations run over budget; lower via
  // `wrangler secret put PBKDF2_ITERS` if logins hit CPU errors. The count is
  // stored per hash, so existing passwords keep verifying after a change.
  iterations() {
    return Number(this.env.PBKDF2_ITERS) || 100_000
  }

  async hashPassword(password) {
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const iters = this.iterations()
    return `${iters}:${toHex(salt)}:${await pbkdf2(password, salt, iters)}`
  }

  async verifyPassword(password, stored) {
    const [iters, saltHex, hashHex] = stored.split(':')
    return (await pbkdf2(password, fromHex(saltHex), Number(iters))) === hashHex
  }

  row(query, ...params) {
    return this.sql.exec(query, ...params).toArray()[0]
  }

  bearerToken(request) {
    const m = /^Bearer (.+)$/.exec(request.headers.get('Authorization') ?? '')
    return m ? m[1] : null
  }

  userFor(request) {
    const token = this.bearerToken(request)
    if (!token) return null
    const session = this.row('SELECT user_id FROM sessions WHERE token = ?', token)
    if (!session) return null
    return this.row('SELECT id, email FROM users WHERE id = ?', session.user_id) ?? null
  }

  isMember(room, userId) {
    return !!this.row('SELECT 1 AS x FROM members WHERE room = ? AND user_id = ?', room, userId)
  }

  startSession(userId) {
    const token = toHex(crypto.getRandomValues(new Uint8Array(32)))
    this.sql.exec(
      'INSERT INTO sessions (token, user_id, created) VALUES (?, ?, ?)',
      token,
      userId,
      Date.now(),
    )
    return token
  }

  async readBody(request) {
    try {
      return await request.json()
    } catch {
      return {}
    }
  }

  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
    try {
      return await this.route(request)
    } catch (e) {
      console.error('directory error:', e)
      return err(500, 'internal error')
    }
  }

  async route(request) {
    const path = new URL(request.url).pathname
    const method = request.method

    if (path === '/internal/ws-auth' && method === 'POST') {
      const { token, room } = await this.readBody(request)
      const registered = !!this.row('SELECT 1 AS x FROM budgets WHERE room = ?', room)
      let allowed = false
      if (token && registered) {
        const session = this.row('SELECT user_id FROM sessions WHERE token = ?', token)
        if (session) allowed = this.isMember(room, session.user_id)
      }
      return json({ allowed, registered })
    }

    if (path === '/api/signup' && method === 'POST') {
      const { email, password } = await this.readBody(request)
      const normalized = String(email ?? '').trim().toLowerCase()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return err(400, 'invalid email')
      if (typeof password !== 'string' || password.length < 8) {
        return err(400, 'password must be at least 8 characters')
      }
      if (this.row('SELECT 1 AS x FROM users WHERE email = ?', normalized)) {
        return err(409, 'email already registered')
      }
      const id = crypto.randomUUID()
      this.sql.exec(
        'INSERT INTO users (id, email, pass, created) VALUES (?, ?, ?, ?)',
        id,
        normalized,
        await this.hashPassword(password),
        Date.now(),
      )
      return json({ token: this.startSession(id), userId: id, email: normalized })
    }

    if (path === '/api/login' && method === 'POST') {
      const { email, password } = await this.readBody(request)
      const normalized = String(email ?? '').trim().toLowerCase()
      const user = this.row('SELECT id, email, pass FROM users WHERE email = ?', normalized)
      if (!user || typeof password !== 'string' || !(await this.verifyPassword(password, user.pass))) {
        return err(401, 'wrong email or password')
      }
      return json({ token: this.startSession(user.id), userId: user.id, email: user.email })
    }

    if (path === '/api/logout' && method === 'POST') {
      const token = this.bearerToken(request)
      if (token) this.sql.exec('DELETE FROM sessions WHERE token = ?', token)
      return json({ ok: true })
    }

    const user = this.userFor(request)
    if (!user) return err(401, 'not signed in')

    if (path === '/api/me' && method === 'GET') return json({ userId: user.id, email: user.email })

    if (path === '/api/budgets' && method === 'GET') {
      const budgets = this.sql
        .exec(
          `SELECT b.room, b.name, (SELECT COUNT(*) FROM members c WHERE c.room = b.room) AS members
           FROM budgets b JOIN members m ON m.room = b.room
           WHERE m.user_id = ? ORDER BY b.created`,
          user.id,
        )
        .toArray()
      return json({ budgets })
    }

    if (path === '/api/budgets' && method === 'POST') {
      const { room, name } = await this.readBody(request)
      if (typeof room !== 'string' || !ROOM_RE.test(room)) return err(400, 'invalid room')
      const trimmed = typeof name === 'string' ? name.trim() : ''
      if (!trimmed) return err(400, 'invalid name')
      const existing = this.row('SELECT name FROM budgets WHERE room = ?', room)
      if (existing) {
        // Re-registering a budget you already belong to is a no-op (clients
        // retry after offline creates); someone else's room is a conflict
        if (!this.isMember(room, user.id)) return err(409, 'room already registered')
        return json({ room, name: existing.name })
      }
      this.sql.exec(
        'INSERT INTO budgets (room, name, created) VALUES (?, ?, ?)',
        room,
        trimmed,
        Date.now(),
      )
      this.sql.exec('INSERT INTO members (room, user_id) VALUES (?, ?)', room, user.id)
      return json({ room, name: trimmed })
    }

    if (path === '/api/join' && method === 'POST') {
      const { code } = await this.readBody(request)
      const invite =
        typeof code === 'string'
          ? this.row('SELECT room, expires FROM invites WHERE code = ?', code.trim().toUpperCase())
          : null
      const budget =
        invite && invite.expires > Date.now()
          ? this.row('SELECT room, name FROM budgets WHERE room = ?', invite.room)
          : null
      if (!budget) return err(404, 'invalid or expired invite code')
      this.sql.exec(
        'INSERT OR IGNORE INTO members (room, user_id) VALUES (?, ?)',
        budget.room,
        user.id,
      )
      return json({ room: budget.room, name: budget.name })
    }

    const budgetPath = /^\/api\/budgets\/([a-zA-Z0-9_-]{1,64})(\/invite)?$/.exec(path)
    if (budgetPath) {
      const room = budgetPath[1]
      if (!this.isMember(room, user.id)) return err(403, 'not a member of this budget')

      if (budgetPath[2] && method === 'POST') {
        const code = inviteCode()
        const expires = Date.now() + INVITE_TTL_MS
        this.sql.exec(
          'INSERT INTO invites (code, room, created_by, expires) VALUES (?, ?, ?, ?)',
          code,
          room,
          user.id,
          expires,
        )
        return json({ code, expires })
      }

      if (!budgetPath[2] && method === 'PATCH') {
        const { name } = await this.readBody(request)
        const trimmed = typeof name === 'string' ? name.trim() : ''
        if (!trimmed) return err(400, 'invalid name')
        this.sql.exec('UPDATE budgets SET name = ? WHERE room = ?', trimmed, room)
        return json({ room, name: trimmed })
      }

      if (!budgetPath[2] && method === 'DELETE') {
        // Leaving is per-member; the last member out takes the data with them
        this.sql.exec('DELETE FROM members WHERE room = ? AND user_id = ?', room, user.id)
        const left = this.row('SELECT COUNT(*) AS n FROM members WHERE room = ?', room).n
        let purged = false
        if (left === 0) {
          this.sql.exec('DELETE FROM budgets WHERE room = ?', room)
          this.sql.exec('DELETE FROM invites WHERE room = ?', room)
          await this.env.Y_DOC.get(this.env.Y_DOC.idFromName(room)).fetch('https://do/purge', {
            method: 'DELETE',
          })
          purged = true
        }
        return json({ ok: true, purged })
      }
    }

    return err(404, 'not found')
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const directory = () => env.DIRECTORY.get(env.DIRECTORY.idFromName('main'))

    if (url.pathname.startsWith('/api/')) return directory().fetch(request)

    if (request.headers.get('Upgrade') !== 'websocket') {
      // The PWA is served from this same Worker; matching asset paths never
      // reach here, so this covers unknown paths (assets 404) and health pings
      if (env.ASSETS) return env.ASSETS.fetch(request)
      return new Response('Budgetlope sync (Cloudflare Workers). Connect via WebSocket.', {
        status: 200,
      })
    }

    const room = url.pathname.replace(/^\/+/, '')
    if (!ROOM_RE.test(room)) {
      return new Response('Bad room name', { status: 400 })
    }

    const token = url.searchParams.get('token') ?? ''
    let allowed = false
    let registered = true // fail closed if the directory is unreachable
    try {
      const res = await directory().fetch('https://directory/internal/ws-auth', {
        method: 'POST',
        body: JSON.stringify({ token, room }),
      })
      ;({ allowed, registered } = await res.json())
    } catch (e) {
      console.error('ws-auth failed:', e)
    }
    // Rooms not registered to any account keep the original shared-token
    // behavior, so existing devices continue to sync until they sign in
    if (!allowed && !registered && (!env.SYNC_TOKEN || token === env.SYNC_TOKEN)) {
      allowed = true
    }
    if (!allowed) {
      // Complete the handshake, then close with 4401 so clients can tell
      // "unauthorized" apart from "server unreachable" and stop retrying.
      const pair = new WebSocketPair()
      pair[1].accept()
      pair[1].close(4401, 'unauthorized')
      return new Response(null, { status: 101, webSocket: pair[0] })
    }
    return env.Y_DOC.get(env.Y_DOC.idFromName(room)).fetch(request)
  },
}
