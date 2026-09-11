import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // ZEFIX → zefix.admin.ch (public, pas de clé)
      '/zefix': {
        target: 'https://www.zefix.admin.ch',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/zefix/, '/ZefixREST/api/v1'),
      },
      // Routes API locales → serveur dev api-dev-server.mjs (port 3001)
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: false,
      },
    },
  },
})
