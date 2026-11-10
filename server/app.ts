import express from 'express'
import { containerStats, dockerServerVersion, listContainers, type Container, type DockerCommand } from './docker.js'
import { CoolifyError, createCoolifyTransport, type CoolifySnapshot, type CoolifyTransport } from './coolify.js'

export type DiagnosticStatus = 'OK' | 'WARN' | 'ERROR'

export interface SystemDiagnostics {
  checkedAt: string
  dockerVersion: string | null
  containersFound: number | null
  lastDiscovery: string | null
  discoveryStatus: DiagnosticStatus
}

export function createApp(run?: DockerCommand, coolifyTransport?: CoolifyTransport) {
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
