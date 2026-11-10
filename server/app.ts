import express from 'express'
import { containerStats, dockerServerVersion, listContainers, type Container, type DockerCommand } from './docker.js'
import { CoolifyError, createCoolifyTransport, type CoolifySnapshot, type CoolifyTransport } from './coolify.js'
import { ProxmoxError, createProxmoxTransport, createSimulatedProxmoxTransport, type ProxmoxSnapshot, type ProxmoxTransport } from './proxmox.js'

export type DiagnosticStatus = 'OK' | 'WARN' | 'ERROR'

export interface SystemDiagnostics {
  checkedAt: string
  dockerVersion: string | null
  containersFound: number | null
  lastDiscovery: string | null
  discoveryStatus: DiagnosticStatus
}

export function createApp(run?: DockerCommand, coolifyTransport?: CoolifyTransport, proxmoxTransport?: ProxmoxTransport) {
  const app = express()
  app.disable('x-powered-by')
  let pendingCollection: Promise<Container[]> | undefined
  let lastDiscovery: string | null = null
  let coolify: CoolifyTransport | undefined = coolifyTransport
  let coolifyConfigurationError = false
  if (!coolify && (process.env.COOLIFY_URL || process.env.COOLIFY_API_KEY)) {
    try {
      const url = process.env.COOLIFY_URL ?? ''
      coolify = createCoolifyTransport(url, process.env.COOLIFY_API_KEY ?? '', fetch, {
        allowInsecureHttp: process.env.COOLIFY_ALLOW_INSECURE_HTTP === 'true',
        diagnosticLogs: process.env.COOLIFY_DIAGNOSTICS_LOG === 'true',
      })
      if (new URL(url).protocol === 'http:') {
        console.warn('Coolify HTTP enabled: API credentials and traffic are unencrypted; use a trusted isolated network')
      }
    } catch {
      coolifyConfigurationError = true
      console.error('Coolify configuration is invalid: require a valid URL and API key; HTTP requires COOLIFY_ALLOW_INSECURE_HTTP=true')
    }
  }
  let pendingCoolify: Promise<CoolifySnapshot> | undefined
  let cachedCoolify: CoolifySnapshot | undefined
  let cachedAt = 0
  const collectCoolify = () => {
    if (!coolify) return Promise.reject(new CoolifyError(coolifyConfigurationError ? 'INVALID_CONFIGURATION' : 'NOT_CONFIGURED'))
    const cacheMs = cachedCoolify ? Math.max(30_000, (cachedCoolify.projects.length + 3) * 600) : 30_000
    if (cachedCoolify && Date.now() - cachedAt < cacheMs) return Promise.resolve(cachedCoolify)
    if (!pendingCoolify) {
      pendingCoolify = coolify.discover().then((snapshot) => {
        cachedCoolify = snapshot
        cachedAt = Date.now()
        return snapshot
      }).finally(() => { pendingCoolify = undefined })
    }
    return pendingCoolify
  }
  let proxmox = proxmoxTransport
  let proxmoxConfigurationError = false
  const proxmoxMode = process.env.PROXMOX_MODE ?? 'live'
  if (!proxmox && proxmoxMode === 'simulated') {
    proxmox = createSimulatedProxmoxTransport()
  } else if (!proxmox && proxmoxMode !== 'live') {
    proxmoxConfigurationError = true
    console.error('Proxmox configuration is invalid: PROXMOX_MODE must be live or simulated')
  } else if (!proxmox && (process.env.PROXMOX_URL || process.env.PROXMOX_API_TOKEN)) {
    try {
      proxmox = createProxmoxTransport(process.env.PROXMOX_URL ?? '', process.env.PROXMOX_API_TOKEN ?? '', fetch, {
        diagnosticLogs: process.env.PROXMOX_DIAGNOSTICS_LOG === 'true',
      })
    } catch {
      proxmoxConfigurationError = true
      console.error('Proxmox configuration is invalid: require an HTTPS URL and API token')
    }
  }
  let pendingProxmox: Promise<ProxmoxSnapshot> | undefined
  let cachedProxmox: ProxmoxSnapshot | undefined
  let proxmoxCachedAt = 0
  const collectProxmox = () => {
    if (!proxmox) return Promise.reject(new ProxmoxError('INVALID_CONFIGURATION'))
    if (cachedProxmox && Date.now() - proxmoxCachedAt < 30_000) return Promise.resolve(cachedProxmox)
    if (!pendingProxmox) {
      pendingProxmox = proxmox.discover().then((snapshot) => {
        cachedProxmox = snapshot
        proxmoxCachedAt = Date.now()
        return snapshot
      }).finally(() => { pendingProxmox = undefined })
    }
    return pendingProxmox
  }
  const collect = () => {
    if (!pendingCollection) {
      pendingCollection = listContainers(run).finally(() => {
        pendingCollection = undefined
      })
      pendingCollection.then(
        () => { lastDiscovery = new Date().toISOString() },
        () => undefined,
      )
    }
    return pendingCollection
  }
  app.use('/api', (_req, res, next) => {
    res.set({
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    })
    next()
  })
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'OK' })
  })
  app.get('/api/coolify/discovery', async (_req, res) => {
    try {
      res.json(await collectCoolify())
    } catch (error) {
      if (error instanceof CoolifyError) {
        console.error(`Coolify discovery unavailable: ${error.code}${error.upstreamStatus ? ` (${error.upstreamStatus})` : ''}`)
      } else {
        console.error('Coolify discovery unavailable: unexpected error')
      }
      res.status(503).json({ error: 'Coolify discovery unavailable' })
    }
  })
  app.get('/api/proxmox/discovery', async (_req, res) => {
    try {
      res.json(await collectProxmox())
    } catch (error) {
      const code = error instanceof ProxmoxError ? error.code : 'UNEXPECTED_ERROR'
      console.error(`Proxmox discovery unavailable: ${!proxmox && !proxmoxConfigurationError ? 'NOT_CONFIGURED' : code}`)
      res.status(503).json({ error: 'Proxmox discovery unavailable' })
    }
  })
  app.get('/api/proxmox/health', async (_req, res) => {
    try {
      if (!proxmox) throw new ProxmoxError('INVALID_CONFIGURATION')
      res.json({ status: 'OK', ...await proxmox.health() })
    } catch (error) {
      const code = error instanceof ProxmoxError ? error.code : 'UNEXPECTED_ERROR'
      console.error(`Proxmox health unavailable: ${!proxmox && !proxmoxConfigurationError ? 'NOT_CONFIGURED' : code}`)
      res.status(503).json({ status: 'ERROR', error: 'Proxmox health unavailable' })
    }
  })
  app.get('/api/diagnostics', async (_req, res) => {
    const [versionResult, collectionResult] = await Promise.allSettled([
      dockerServerVersion(run),
      collect(),
    ])
    if (versionResult.status === 'rejected') console.error('Docker version diagnostics failed:', versionResult.reason)
    if (collectionResult.status === 'rejected') console.error('Docker discovery diagnostics failed:', collectionResult.reason)
    const diagnostics: SystemDiagnostics = {
      checkedAt: new Date().toISOString(),
      dockerVersion: versionResult.status === 'fulfilled' ? versionResult.value : null,
      containersFound: collectionResult.status === 'fulfilled' ? collectionResult.value.length : null,
      lastDiscovery,
      discoveryStatus: collectionResult.status === 'fulfilled' ? 'OK' : 'ERROR',
    }
    res.json(diagnostics)
  })
  app.get(['/api/docker/containers', '/api/docker/stats'], async (req, res) => {
    try {
      const containers = await collect()
      const result = req.path.endsWith('/stats') ? containerStats(containers) : containers
      res.json(result)
    } catch (error) {
      console.error('Docker collection failed:', error)
      res.status(503).json({ error: 'Docker telemetry unavailable' })
    }
  })
  app.all('/api/docker/*path', (_req, res) => {
    res.status(404).json({ error: 'Docker endpoint not found' })
  })
  return app
}
