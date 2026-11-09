import express from 'express'
import { containerStats, listContainers, type Container, type DockerCommand } from './docker.js'

export function createApp(run?: DockerCommand) {
  const app = express()
  app.disable('x-powered-by')
  let pendingCollection: Promise<Container[]> | undefined
  const collect = () => {
    if (!pendingCollection) {
      pendingCollection = listContainers(run).finally(() => {
        pendingCollection = undefined
      })
    }
    return pendingCollection
  }
  app.use('/api/docker', (_req, res, next) => {
    res.set({
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    })
    next()
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
