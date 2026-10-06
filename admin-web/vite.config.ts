import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'import.meta.env.SUBDOMAIN_PORTAL_ENFORCEMENT': JSON.stringify(env.SUBDOMAIN_PORTAL_ENFORCEMENT ?? 'false'),
    },
  }
})
