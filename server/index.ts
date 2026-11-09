import { createApp } from './app.js'

const host = process.env.API_HOST || '127.0.0.1'
const port = Number(process.env.API_PORT || '3001')
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('API_PORT must be a valid TCP port')
const loopbackHosts = new Set(['127.0.0.1', '::1', 'localhost'])
if (!loopbackHosts.has(host) && process.env.API_ALLOW_REMOTE !== 'true') {
  throw new Error('Docker API must bind to loopback unless API_ALLOW_REMOTE=true is explicitly set behind an authenticated TLS proxy')
}
if (!loopbackHosts.has(host)) {
  console.warn('Remote API binding enabled; ensure an authenticated TLS reverse proxy restricts access')
}

createApp().listen(port, host, () => {
  console.log(`NEXUS PRIME API listening on ${host}:${port}`)
})
