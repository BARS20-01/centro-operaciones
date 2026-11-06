import type { DiscoveryResult, NodeInput } from '@/domain/graph'
import type { Status } from '@/types'
import type { DataSource, Integration } from './types'

export type ContainerState = 'running' | 'restarting' | 'paused' | 'exited' | 'dead'

/** Normalised container as the (future) backend must return it. */
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
  /** Optional twin node ids this container needs. */
  dependsOn?: string[]
}

export interface ContainerReading extends DockerContainer {
  uptimeSec: number
  memPercent: number
}

/** Swap this to talk to a real source (HTTP proxy, Docker socket, agent...). */
export interface DockerTransport {
  listContainers(signal: AbortSignal): Promise<DockerContainer[]>
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

/** Plain JSON endpoint; no authentication yet. */
export function httpTransport(url: string): DockerTransport {
  return {
    async listContainers(signal) {
      const res = await fetch(url, { signal, headers: { Accept: 'application/json' } })
      if (!res.ok) throw new Error(`docker api ${res.status}`)
      const body: unknown = await res.json()
      if (!Array.isArray(body)) throw new Error('docker api: unexpected payload')
      return body as DockerContainer[]
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

  return {
    listContainers() {
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
    },
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
  const {
    transport = httpTransport(import.meta.env.VITE_DOCKER_API_URL ?? '/api/docker/containers'),
    fallback = simulatedTransport(),
    timeoutMs = 1500,
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
        const live = await transport.listContainers(ctrl.signal)
        source = 'live'
        return live
      } catch {
        retryAt = Date.now() + retryAfterMs
      } finally {
        clearTimeout(timer)
      }
    }
    source = 'simulated'
    return fallback.listContainers(new AbortController().signal)
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
        kind: 'container',
        layer: 'services',
        status: statusFromContainer(c),
        parentId: hostId,
        origin: 'discovered',
        metrics: { cpuPercent: c.cpuPercent, memPercent: c.memPercent, memBytes: c.memBytes, uptimeSec: c.uptimeSec },
      }))
      const ids = new Set(nodes.map((n) => n.id))
      const removed = [...known].filter((id) => !ids.has(id))
      known = ids
      return {
        nodes,
        removed,
        dependencies: readings.flatMap((c) => (c.dependsOn ?? []).map((to) => ({ from: `ctr-${c.name}`, to }))),
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
