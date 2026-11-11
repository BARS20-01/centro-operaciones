import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), 'NEXUS_')
  const clientEnv = loadEnv(mode, process.cwd(), 'VITE_DOCKER_')
  const dockerOverrides = [
    ['VITE_DOCKER_API_URL', clientEnv.VITE_DOCKER_API_URL, '/api/docker/containers'],
    ['VITE_DOCKER_STATS_URL', clientEnv.VITE_DOCKER_STATS_URL, '/api/docker/stats'],
  ]
  for (const [name, value, expected] of dockerOverrides) {
    if (value && value !== expected) {
      throw new Error(`${name} must be ${expected}; configure the shared API origin instead`)
    }
  }
  if (command === 'serve' && env.NEXUS_DIAGNOSTICS_API_TARGET) {
    console.warn('NEXUS_DIAGNOSTICS_API_TARGET is no longer used. Set NEXUS_API_TARGET explicitly to select the shared development API.')
  }
  const target = env.NEXUS_API_TARGET || 'http://127.0.0.1:3001'
  const url = new URL(target)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('NEXUS_API_TARGET must be an HTTP(S) origin without credentials or path')
  }
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    define: {
      'import.meta.env.VITE_API_ORIGIN': JSON.stringify(command === 'build' ? '' : url.origin),
    },
    server: {
      proxy: {
        '/api': {
          target: url.origin,
          changeOrigin: true,
        },
      },
    },
  }
})
