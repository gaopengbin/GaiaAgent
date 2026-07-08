import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

const host = process.env.TAURI_DEV_HOST ?? '127.0.0.1'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 5173 } : undefined,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: ['es2021', 'chrome105', 'safari15'],
    minify: !process.env.TAURI_DEBUG,
    sourcemap: !!process.env.TAURI_DEBUG,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replaceAll('\\', '/')
          if (!normalizedId.includes('node_modules')) return undefined
          if (normalizedId.includes('/@zip.js/')) return 'vendor-zip'
          if (normalizedId.includes('/react-markdown/') || normalizedId.includes('/remark-gfm/')) {
            return 'vendor-markdown'
          }
          if (normalizedId.includes('/@radix-ui/')) return 'vendor-radix'
          if (normalizedId.includes('/lucide-react/')) return 'vendor-icons'
          if (normalizedId.includes('/@tauri-apps/')) return 'vendor-tauri'
          if (normalizedId.includes('/i18next/') || normalizedId.includes('/react-i18next/')) {
            return 'vendor-i18n'
          }
          if (normalizedId.includes('/react/') || normalizedId.includes('/react-dom/')) {
            return 'vendor-react'
          }
          return undefined
        },
      },
    },
  },
})
