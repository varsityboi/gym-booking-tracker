import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // The API's CORS allows http://localhost:5173 (CLIENT_ORIGIN). If the port
    // is taken, fail instead of quietly moving to 5174, which CORS would block.
    port: 5173,
    strictPort: true,
  },
})
