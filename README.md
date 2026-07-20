# Budgetlope

Local-first envelope budgeting PWA in the style of YNAB. Works fully offline;
optionally live-syncs between devices through a small self-hosted sync server
with CRDT (field-level) merging.

## Stack

- **Vite + React + TypeScript**
- **Ant Design** (desktop UI) and **Ant Design Mobile** (phone UI, chosen by
  viewport at runtime; each ships as its own lazy-loaded chunk)
- **Yjs** CRDT document persisted locally with **y-indexeddb**, synced via
  **Hocuspocus** (`@hocuspocus/provider` client, server in `server/`)
- **zustand** store snapshotting the Y.Doc on every update
- **dnd-kit** for drag-and-drop reordering
- **vite-plugin-pwa** (installable, offline-capable, auto-updating)

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
```

## Features

- Envelope budgeting: monthly Assigned / Activity / Available per category,
  with balances carried forward month to month and a Ready to Assign header.
- Accounts: checking, savings, credit card. Credit cards get an auto-managed
  "Credit Card Payments" category — categorized spending on the card moves
  that amount into the payment category, payments (transfers) draw it down.
- Register with inline row editing (click a row to edit in place, Enter saves,
  Esc cancels), payee autocomplete, transfers via the payee field, one-click
  cleared toggle, search, All Accounts view.
- Drag-and-drop reordering of category groups and categories (desktop).
- **Multiple budgets**: switch, create, rename, and delete budgets from the
  sidebar dropdown (desktop) or Settings (mobile). Each budget is its own
  Yjs document with its own local database and sync document.
- Mobile UI: bottom tab bar, swipe-to-delete/clear transactions, swipe
  actions on budget categories (rename/hide/delete/zero), bottom-sheet
  transaction editor with a searchable category picker, tap-to-assign budget.
- JSON export/import backup (Settings); imports from the earlier PouchDB
  version's backups work too.

## Sync

Both servers speak the standard y-websocket protocol with token auth (the
token travels as a `?token=` query parameter — terminate TLS so it stays
private). Pick one:

**Option A — Cloudflare Workers + Durable Objects (free tier, no server to run):**

The Worker serves BOTH the app and sync from one URL.

```bash
cd worker && npm install && npx wrangler secret put SYNC_TOKEN && cd ..
npm run deploy    # builds dist/ and deploys app + sync worker together
```

Open the printed `https://budgetlope.<you>.workers.dev` URL on each device
(install it as a PWA from the browser menu), then in Settings → Device Sync
enter `wss://budgetlope.<you>.workers.dev` + your token. Each budget becomes
its own Durable Object with WebSocket hibernation, so a two-person household
runs comfortably within the free tier. Local dev: `cd worker && npm run dev`
with the token in `.dev.vars`.

**Option B — self-hosted Node server:**

```bash
cd server
npm install
SYNC_TOKEN=some-long-secret npm start   # PORT=8787, DATA_DIR=data by default
```

Then in the app: Settings → Device Sync → URL (`wss://budgetlope-sync.<you>.workers.dev`
or `ws://host:8787`) + the token → Save & Connect. Sync is live and
bidirectional; each device keeps the full budget in IndexedDB and stays fully
usable offline. Each budget syncs as its own document (`budgetlope` for the
first budget, `budgetlope-<id>` for others). Concurrent edits merge **per field** (one device edits a
transaction's memo while another edits its amount → both survive) instead of
last-write-wins per record.

## Data model

One Y.Doc per budget with five top-level `Y.Map`s — `accounts`, `groups`, `categories`,
`txns`, `allocs` — each mapping an id to a nested `Y.Map` of fields, so
concurrent field edits merge cleanly.

| Record         | id                        | Notes                                    |
| -------------- | ------------------------- | ---------------------------------------- |
| account        | `acct:<id>`               | name, type, sort                         |
| category group | `grp:<id>`                | fixed id `grp:cc-payments` for CC group  |
| category       | `cat:<id>`                | `ccAccountId` marks CC payment category  |
| transaction    | `txn:<id>`                | cents; transfers are paired records linked by `transferTxnId` |
| allocation     | `alloc:<YYYY-MM>:<catId>` | assigned cents per category per month    |

All money is integer cents. Budget math intentionally lets negative category
balances carry forward (instead of YNAB's reset-to-zero) so the ledger always
conserves money; Ready to Assign = RTA inflows − everything assigned
(including future months).
