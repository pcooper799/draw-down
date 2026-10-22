/**
 * Renderer-only Vite config for Electron reliability tests.
 * Avoids vite-plugin-electron auto-launch so Playwright controls the app process.
 */
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: './',
  resolve: {
    alias: {
      '@': path.join(__dirname, '../src'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 43141,
    strictPort: true,
  },
  plugins: [react(), tailwindcss()],
  clearScreen: false,
})
