import type { DiscoveryResult, NodeInput } from '@/domain/graph'
import type { Status } from '@/types'
import type { DataSource, Integration } from './types'

export type ContainerState = 'running' | 'restarting' | 'paused' | 'exited' | 'dead'

/** Normalised container returned by the backend. */
export interface DockerContainer {
  id: string
  name: string
  image: string
  state: ContainerState
  /** ISO timestamp of the last start; uptime is derived from it. */
  startedAt: string
  cpuPercent: number
  memBytes: number
  memLimitBytes: number
  ports?: string[]
  networks?: string[]
  /** Optional twin node ids this container needs. */
  dependsOn?: string[]
}

export interface DockerStats {
  id: string
  name: string
  cpu: number
  memory: number
  memoryLimit: number
  memoryPercent: number
}

export interface ContainerReading extends DockerContainer {
  uptimeSec: number
  memPercent: number
}

function containerKind(name: string): NodeInput['kind'] {
  const normalized = name.toLowerCase().replace(/-\d+$/, '')
  if (normalized === 'coolify') return 'coolify'
  if (normalized === 'grafana') return 'grafana'
  if (normalized === 'uptime-kuma') return 'uptime'
  if (normalized === 'postgres' || normalized === 'postgresql' || normalized === 'coolify-db') return 'postgres'
  if (normalized.startsWith('sgs')) return 'sgs'
  if (normalized.startsWith('wallboard')) return 'wallboard'
  return 'container'
}

/** Transport contract reusable by a proxy, host-side agent, or another integration. */
export interface DockerTransport {
  listContainers(signal: AbortSignal): Promise<DockerContainer[]>
  listStats?(signal: AbortSignal): Promise<DockerStats[]>
}

export interface DockerOptions {
  transport?: DockerTransport
  /** Fallback used while the upstream is unreachable. */
  fallback?: DockerTransport
  timeoutMs?: number
  /** Minimum wait before retrying a failed upstream. */
  retryAfterMs?: number
  /** Twin node that hosts the containers. */
  hostId?: string
}

const GB = 1024 ** 3
const MB = 1024 ** 2

function isContainer(value: unknown): value is DockerContainer {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const c = value as Record<string, unknown>
  const nonnegative = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0
  return typeof c.id === 'string' && c.id.length > 0 &&
    typeof c.name === 'string' && c.name.length > 0 &&
    typeof c.image === 'string' && c.image.length > 0 &&
    typeof c.state === 'string' && ['running', 'restarting', 'paused', 'exited', 'dead'].includes(c.state) &&
    typeof c.startedAt === 'string' && (c.state !== 'running' || Number.isFinite(Date.parse(c.startedAt))) &&
    nonnegative(c.cpuPercent) && nonnegative(c.memBytes) && nonnegative(c.memLimitBytes) &&
    (c.ports === undefined || (Array.isArray(c.ports) && c.ports.every((port) => typeof port === 'string'))) &&
    (c.networks === undefined || (Array.isArray(c.networks) && c.networks.every((network) => typeof network === 'string'))) &&
    (c.dependsOn === undefined || (Array.isArray(c.dependsOn) && c.dependsOn.every((id: unknown) => typeof id === 'string')))
}

function statsEndpoint(containersUrl: string) {
  try {
    const url = new URL(containersUrl)
    url.pathname = url.pathname.replace(/\/containers\/?$/, '/stats')
    return url.toString()
  } catch {
    const [path, query] = containersUrl.split('?')
    return `${path.replace(/\/containers\/?$/, '/stats')}${query ? `?${query}` : ''}`
  }
}

function isStats(value: unknown): value is DockerStats {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const stats = value as Record<string, unknown>
  const nonnegative = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0
  return typeof stats.id === 'string' && typeof stats.name === 'string' &&
    nonnegative(stats.cpu) && nonnegative(stats.memory) && nonnegative(stats.memoryLimit) &&
    nonnegative(stats.memoryPercent)
}

export function httpTransport(url: string, statsUrl = statsEndpoint(url)): DockerTransport {
  return {
    async listContainers(signal) {
      const res = await fetch(url, { signal, headers: { Accept: 'application/json' } })
      if (!res.ok) throw new Error(`docker api ${res.status}`)
      const body: unknown = await res.json()
      if (!Array.isArray(body) || !body.every(isContainer)) throw new Error('docker api: unexpected payload')
      return body
    },
    async listStats(signal) {
      const res = await fetch(statsUrl, { signal, headers: { Accept: 'application/json' } })
      if (!res.ok) throw new Error(`docker stats api ${res.status}`)
      const body: unknown = await res.json()
      if (!Array.isArray(body) || !body.every(isStats)) throw new Error('docker stats api: unexpected payload')
      return body
    },
  }
}

interface SimSpec {
  name: string
  image: string
  cpu: number
  memMb: number
  limitMb: number
  dependsOn?: string[]
}

const SIM_SPECS: SimSpec[] = [
  { name: 'coolify-proxy', image: 'traefik:v3', cpu: 6, memMb: 90, limitMb: 512 },
  { name: 'postgres-main', image: 'postgres:16', cpu: 18, memMb: 820, limitMb: 2048 },
  { name: 'sgs-api', image: 'sgs/api:latest', cpu: 24, memMb: 410, limitMb: 1024, dependsOn: ['postgres'] },
  { name: 'wallboard-web', image: 'wallboard/web:latest', cpu: 9, memMb: 180, limitMb: 512, dependsOn: ['postgres'] },
  { name: 'grafana', image: 'grafana/grafana:11', cpu: 12, memMb: 260, limitMb: 768 },
  { name: 'uptime-kuma', image: 'louislam/uptime-kuma:1', cpu: 4, memMb: 140, limitMb: 512 },
]

/** Deterministic-ish simulator so the twin keeps working without any API. */
export function simulatedTransport(): DockerTransport {
  const boot = Date.now()
  const started = new Map(SIM_SPECS.map((s, i) => [s.name, boot - (i + 1) * 3_600_000]))
  const down = new Map<string, number>()

  const listContainers = () => {
    const now = Date.now()
    return Promise.resolve(
      SIM_SPECS.map((s): DockerContainer => {
        const outageEnd = down.get(s.name)
        if (outageEnd && now > outageEnd) {
          down.delete(s.name)
          started.set(s.name, now)
        } else if (!outageEnd && Math.random() < 0.02) {
          down.set(s.name, now + 15_000)
        }
        const stopped = down.has(s.name)
        const spike = Math.random() < 0.05 ? 3.5 : 1
        const cpu = stopped ? 0 : Math.min(100, s.cpu * spike * (0.7 + Math.random() * 0.6))
        return {
          id: `sim-${s.name}`,
          name: s.name,
          image: s.image,
          state: stopped ? 'exited' : 'running',
          startedAt: new Date(started.get(s.name) ?? now).toISOString(),
          cpuPercent: Math.round(cpu * 10) / 10,
          memBytes: stopped ? 0 : Math.round(s.memMb * MB * (0.9 + Math.random() * 0.2)),
          memLimitBytes: s.limitMb * MB,
          dependsOn: s.dependsOn,
        }
      }),
    )
  }

  return {
    listContainers,
  }
}

export function statusFromContainer(c: Pick<ContainerReading, 'state' | 'cpuPercent' | 'memPercent'>): Status {
  switch (c.state) {
    case 'running':
      return c.cpuPercent >= 85 || c.memPercent >= 90 ? 'warn' : 'ok'
    case 'restarting':
    case 'paused':
      return 'warn'
    case 'exited':
      return 'offline'
    default:
      return 'critical'
  }
}

const toReading = (c: DockerContainer, now: number): ContainerReading => ({
  ...c,
  uptimeSec: c.state === 'running' ? Math.max(0, Math.floor((now - Date.parse(c.startedAt)) / 1000)) : 0,
  memPercent: c.memLimitBytes > 0 ? Math.round((c.memBytes / c.memLimitBytes) * 1000) / 10 : 0,
})

export interface DockerIntegration extends Integration {
  id: 'docker'
  getContainers(): Promise<ContainerReading[]>
}

export function createDockerIntegration(options: DockerOptions = {}): DockerIntegration {
  const containersUrl = import.meta.env.VITE_DOCKER_API_URL ?? '/api/docker/containers'
  const statsUrl = import.meta.env.VITE_DOCKER_STATS_URL
  const {
    transport = httpTransport(containersUrl, statsUrl ?? statsEndpoint(containersUrl)),
    fallback = simulatedTransport(),
    timeoutMs = 40_000,
    retryAfterMs = 30_000,
    hostId = 'docker',
  } = options

  let source: DataSource = 'simulated'
  let retryAt = 0
  let known = new Set<string>()

  async function fetchRaw(): Promise<DockerContainer[]> {
    if (Date.now() >= retryAt) {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), timeoutMs)
      try {
        const [live, stats] = await Promise.all([
          transport.listContainers(ctrl.signal),
          transport.listStats?.(ctrl.signal),
        ])
        source = 'live'
        if (!stats) return live
        const byId = new Map(stats.map((reading) => [reading.id, reading]))
        const byName = new Map(stats.map((reading) => [reading.name, reading]))
        return live.map((container) => {
          const reading = byId.get(container.id) ?? byName.get(container.name)
          return reading
            ? { ...container, cpuPercent: reading.cpu, memBytes: reading.memory, memLimitBytes: reading.memoryLimit }
            : container
        })
      } catch (error) {
        console.warn('Docker API unavailable; using simulated containers:', error)
        retryAt = Date.now() + retryAfterMs
      } finally {
        clearTimeout(timer)
      }
    }
    source = 'simulated'
    const signal = new AbortController().signal
    const [containers, stats] = await Promise.all([fallback.listContainers(signal), fallback.listStats?.(signal)])
    if (!stats) return containers
    const byId = new Map(stats.map((reading) => [reading.id, reading]))
    return containers.map((container) => {
      const reading = byId.get(container.id)
      return reading
        ? { ...container, cpuPercent: reading.cpu, memBytes: reading.memory, memLimitBytes: reading.memoryLimit }
        : container
    })
  }

  async function getContainers() {
    const now = Date.now()
    return (await fetchRaw()).map((c) => toReading(c, now))
  }

  return {
    id: 'docker',
    name: 'Docker',
    description: 'Contenedores del host',
    feeds: 'services',
    get source() {
      return source
    },
    getContainers,

    async ping() {
      try {
        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), timeoutMs)
        try {
          await transport.listContainers(ctrl.signal)
          return true
        } finally {
          clearTimeout(timer)
        }
      } catch {
        return false
      }
    },

    async discover(): Promise<DiscoveryResult> {
      const readings = await getContainers()
      const nodes: NodeInput[] = readings.map((c) => ({
        id: `ctr-${c.name}`,
        name: c.name,
        kind: containerKind(c.name),
        layer: 'services',
        status: statusFromContainer(c),
        parentId: hostId,
        origin: 'discovered',
        description: `Contenedor de ${c.image}`,
        category: 'Docker container',
        source,
        image: c.image,
        ports: c.ports,
        networks: c.networks,
        startedAt: c.startedAt,
        metrics: { cpuPercent: c.cpuPercent, memPercent: c.memPercent, memBytes: c.memBytes, uptimeSec: c.uptimeSec },
      }))
      const nodeIdsByName = new Map(readings.map((container) => [container.name, `ctr-${container.name}`]))
      const ids = new Set(nodes.map((n) => n.id))
      const removed = [...known].filter((id) => !ids.has(id))
      known = ids
      return {
        nodes,
        removed,
        dependencies: readings.flatMap((container) =>
          (container.dependsOn ?? []).flatMap((dependency) => {
            const to = nodeIdsByName.get(dependency) ?? dependency
            return to === `ctr-${container.name}` ? [] : [{ from: `ctr-${container.name}`, to }]
          }),
        ),
      }
    },
  }
}

export const dockerIntegration = createDockerIntegration()

export const formatBytes = (b: number) => (b >= GB ? `${(b / GB).toFixed(1)} GB` : `${Math.round(b / MB)} MB`)

export function formatUptime(sec: number) {
  if (sec <= 0) return '—'
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`
}
