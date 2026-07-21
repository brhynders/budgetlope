import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  resolve: {
    // y-websocket pulls in its own yjs otherwise — two Y instances break
    // constructor checks inside the CRDT
    dedupe: ['yjs'],
  },
  optimizeDeps: {
    // Pre-bundling can split @dnd-kit/core into a second copy inside the
    // sortable chunk, disconnecting useSortable from DndContext (dev-only)
    exclude: ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Budgetlope',
        short_name: 'Budgetlope',
        description: 'Local-first envelope budgeting',
        theme_color: '#0c110f',
        background_color: '#0c110f',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // iOS fetches launch screens itself at install time — don't bloat the
        // service-worker precache with them
        globIgnores: ['**/splash/**'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
})
