import express from 'express'
import { containerStats, dockerServerVersion, listContainers, type Container, type DockerCommand } from './docker.js'

export type DiagnosticStatus = 'OK' | 'WARN' | 'ERROR'

export interface SystemDiagnostics {
  checkedAt: string
  dockerVersion: string | null
  containersFound: number | null
  lastDiscovery: string | null
  discoveryStatus: DiagnosticStatus
}

export function createApp(run?: DockerCommand) {
  const app = express()
  app.disable('x-powered-by')
  let pendingCollection: Promise<Container[]> | undefined
  let lastDiscovery: string | null = null
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
