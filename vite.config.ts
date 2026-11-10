import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), 'NEXUS_')
  const target = env.NEXUS_DIAGNOSTICS_API_TARGET || 'http://127.0.0.1:3001'
  const url = new URL(target)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('NEXUS_DIAGNOSTICS_API_TARGET must be an HTTP(S) origin without credentials or path')
  }
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    define: {
      'import.meta.env.VITE_DIAGNOSTICS_ORIGIN': JSON.stringify(command === 'build' ? '' : url.origin),
    },
    server: {
      proxy: {
        '/api': 'http://127.0.0.1:3001',
        '/diagnostics-api': {
          target: url.origin,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/diagnostics-api(?=\/|$)/, '/api'),
        },
      },
    },
  }
})
