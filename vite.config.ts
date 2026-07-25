import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2022',
    // Keep the bundle inspectable. Part of the J4 promise is that a curious
    // user (or a reviewer) can read what ships and confirm nothing phones home.
    sourcemap: true,
  },
})
