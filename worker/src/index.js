// Budgetlope sync on Cloudflare Workers + Durable Objects.
// One Durable Object per budget document; speaks the standard y-websocket
// protocol. Uses the WebSocket hibernation API, so idle connections cost
// nothing; the Y.Doc is rebuilt from storage on wake.
import * as Y from 'yjs'
import * as syncProtocol from 'y-protocols/sync.js'
import * as encoding from 'lib0/encoding.js'
import * as decoding from 'lib0/decoding.js'

const MSG_SYNC = 0
const MSG_AWARENESS = 1

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

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (request.headers.get('Upgrade') !== 'websocket') {
      // The PWA is served from this same Worker; matching asset paths never
      // reach here, so this covers unknown paths (assets 404) and health pings
      if (env.ASSETS) return env.ASSETS.fetch(request)
      return new Response('Budgetlope sync (Cloudflare Workers). Connect via WebSocket.', {
        status: 200,
      })
    }
    if (env.SYNC_TOKEN && url.searchParams.get('token') !== env.SYNC_TOKEN) {
      // Complete the handshake, then close with 4401 so clients can tell
      // "bad token" apart from "server unreachable" and stop retrying.
      const pair = new WebSocketPair()
      pair[1].accept()
      pair[1].close(4401, 'invalid token')
      return new Response(null, { status: 101, webSocket: pair[0] })
    }
    const room = url.pathname.replace(/^\/+/, '')
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(room)) {
      return new Response('Bad room name', { status: 400 })
    }
    return env.Y_DOC.get(env.Y_DOC.idFromName(room)).fetch(request)
  },
}
