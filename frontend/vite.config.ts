import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // The single source-of-truth .env lives at the repo root, not in frontend/.
  // Tell Vite to load VITE_* vars from there.
  envDir: '..',
  build: {
    chunkSizeWarningLimit: 3072, // 3MB - suppress large chunk warnings (main chunk ~2.4MB)
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
