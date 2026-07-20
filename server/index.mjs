// Budgetlope self-host sync server — speaks the standard y-websocket protocol.
// Rooms map to budgets; each room persists as a single Yjs snapshot file.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { WebSocketServer } from 'ws'
import * as Y from 'yjs'
import * as syncProtocol from 'y-protocols/sync.js'
import * as encoding from 'lib0/encoding.js'
import * as decoding from 'lib0/decoding.js'

const PORT = Number(process.env.PORT ?? 8787)
const TOKEN = process.env.SYNC_TOKEN
const DATA_DIR = process.env.DATA_DIR ?? 'data'

const MSG_SYNC = 0
const MSG_AWARENESS = 1

if (!TOKEN) console.warn('WARNING: SYNC_TOKEN is not set — accepting all connections.')
fs.mkdirSync(DATA_DIR, { recursive: true })

/** @type {Map<string, {name: string, doc: Y.Doc, conns: Set<import('ws').WebSocket>, saveTimer: NodeJS.Timeout | null}>} */
const rooms = new Map()

const roomFile = (name) => path.join(DATA_DIR, `${name}.bin`)

function scheduleSave(room) {
  if (room.saveTimer) return
  room.saveTimer = setTimeout(() => {
    room.saveTimer = null
    const file = roomFile(room.name)
    fs.writeFileSync(`${file}.tmp`, Y.encodeStateAsUpdate(room.doc))
    fs.renameSync(`${file}.tmp`, file)
  }, 500)
}

function broadcast(room, data, exclude) {
  for (const conn of room.conns) {
    if (conn !== exclude && conn.readyState === 1) conn.send(data)
  }
}

function getRoom(name) {
  let room = rooms.get(name)
  if (!room) {
    const doc = new Y.Doc()
    const file = roomFile(name)
    if (fs.existsSync(file)) Y.applyUpdate(doc, new Uint8Array(fs.readFileSync(file)))
    room = { name, doc, conns: new Set(), saveTimer: null }
    doc.on('update', (update) => {
      const encoder = encoding.createEncoder()
      encoding.writeVarUint(encoder, MSG_SYNC)
      syncProtocol.writeUpdate(encoder, update)
      broadcast(room, encoding.toUint8Array(encoder))
      scheduleSave(room)
    })
    rooms.set(name, room)
  }
  return room
}

function handleConnection(ws, roomName) {
  const room = getRoom(roomName)
  room.conns.add(ws)

  ws.on('message', (data) => {
    try {
      const msg = new Uint8Array(data)
      const decoder = decoding.createDecoder(msg)
      const type = decoding.readVarUint(decoder)
      if (type === MSG_SYNC) {
        const encoder = encoding.createEncoder()
        encoding.writeVarUint(encoder, MSG_SYNC)
        syncProtocol.readSyncMessage(decoder, encoder, room.doc, ws)
        if (encoding.length(encoder) > 1) ws.send(encoding.toUint8Array(encoder))
      } else if (type === MSG_AWARENESS) {
        // Presence is ephemeral gossip — relay without keeping server state
        broadcast(room, msg, ws)
      }
    } catch (err) {
      console.error('message error:', err)
      ws.close(1011, 'internal error')
    }
  })

  ws.on('close', () => {
    room.conns.delete(ws)
    if (room.conns.size === 0) scheduleSave(room)
  })

  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, MSG_SYNC)
  syncProtocol.writeSyncStep1(encoder, room.doc)
  ws.send(encoding.toUint8Array(encoder))
}

const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain' })
  res.end('Budgetlope sync server. Connect via WebSocket.')
})

const wss = new WebSocketServer({ noServer: true })

server.on('upgrade', (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (TOKEN && url.searchParams.get('token') !== TOKEN) {
      ws.close(4401, 'invalid token')
      return
    }
    const room = url.pathname.replace(/^\/+/, '')
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(room)) {
      ws.close(1008, 'bad room name')
      return
    }
    handleConnection(ws, room)
  })
})

server.listen(PORT, () => {
  console.log(`Budgetlope sync server listening on ws://0.0.0.0:${PORT}`)
})
