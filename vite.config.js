import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/Budget4U/',
  plugins: [react()],
  test: { include: ['tests/**/*.test.js'] },
})
