import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: Number(process.env.PORT) || 5173 },
  // Pyodide ships its own wasm/asm loader and must not be pre-bundled.
  // The runtime files live in public/pyodide (see `npm run sync:pyodide`).
  optimizeDeps: { exclude: ['pyodide'] },
})
