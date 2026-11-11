import { fetchCoolifySnapshot } from '../../integrations/coolify.integration'
import { fetchProxmoxSnapshot, type ProxmoxSnapshot } from '../../integrations/proxmox.integration'

export type OperationalStatus = 'LIVE' | 'SIMULATED' | 'PARTIAL' | 'OFFLINE' | 'UNKNOWN'
export type OperationalSource = 'Docker' | 'Coolify' | 'Proxmox'

export const SOURCE_COLORS: Record<OperationalStatus, string> = {
  LIVE: 'var(--theme-success)',
  SIMULATED: '#38bdf8',
  PARTIAL: 'var(--theme-warning)',
  OFFLINE: 'var(--theme-error)',
  UNKNOWN: '#94a3b8',
}

export interface OperationalReading {
  status: OperationalStatus
  count: number | null
  lastSync: string | null
}

export type OperationalSummary = 'LIVE' | 'SIMULATED' | 'PARTIAL' | 'UNKNOWN'

export function summarizeOperationalStatus(readings: Record<OperationalSource, OperationalReading>): OperationalSummary {
  const statuses = Object.values(readings).map((reading) => reading.status)
  if (statuses.some((status) => status === 'OFFLINE' || status === 'PARTIAL')) return 'PARTIAL'
  if (statuses.some((status) => status === 'UNKNOWN')) return 'UNKNOWN'
  if (statuses.some((status) => status === 'SIMULATED')) return 'SIMULATED'
  return 'LIVE'
}

export type OperationalEnvironment = 'LOCAL' | 'STAGING' | 'PRODUCTION' | 'UNKNOWN'

export function operationalEnvironment(value: string | undefined, development: boolean): OperationalEnvironment {
  if (!value) return development ? 'LOCAL' : 'UNKNOWN'
  if (value === 'LOCAL' || value === 'STAGING' || value === 'PRODUCTION') return value
  console.warn('Invalid VITE_NEXUS_ENVIRONMENT; expected LOCAL, STAGING or PRODUCTION')
  return 'UNKNOWN'
}

export interface DockerDiagnostics {
  dockerVersion: string | null
  containersFound: number | null
  discoveryStatus: 'OK' | 'ERROR'
  lastDiscovery: string | null
}

function validTime(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function isDockerDiagnostics(value: unknown): value is DockerDiagnostics {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const data = value as Record<string, unknown>
  return (data.dockerVersion === null || typeof data.dockerVersion === 'string') &&
    (data.containersFound === null || (typeof data.containersFound === 'number' && Number.isFinite(data.containersFound) && data.containersFound >= 0)) &&
    (data.lastDiscovery === null || validTime(data.lastDiscovery)) &&
    ((data.discoveryStatus === 'OK' && data.containersFound !== null) ||
      (data.discoveryStatus === 'ERROR' && data.containersFound === null))
}

export async function fetchDockerDiagnostics(signal: AbortSignal): Promise<DockerDiagnostics> {
  const response = await fetch('/api/diagnostics', { signal, headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`Docker diagnostics returned ${response.status}`)
  const data: unknown = await response.json()
  if (!isDockerDiagnostics(data)) throw new Error('Invalid Docker diagnostics response')
  return data
}

export function dockerStatus(data: DockerDiagnostics): OperationalStatus {
  const version = data.dockerVersion !== null
  const discovery = data.discoveryStatus === 'OK' && data.containersFound !== null
  if (version && discovery) return 'LIVE'
  if (version || discovery) return 'PARTIAL'
  return 'OFFLINE'
}

export function proxmoxStatus(data: Pick<ProxmoxSnapshot, 'source' | 'snapshotErrors' | 'backupErrors'>): OperationalStatus {
  if (data.source === 'simulated') return 'SIMULATED'
  return data.snapshotErrors > 0 || data.backupErrors > 0 ? 'PARTIAL' : 'LIVE'
}

export async function checkOperationalSource(source: OperationalSource, signal: AbortSignal): Promise<OperationalReading> {
  try {
    if (source === 'Docker') {
      const data = await fetchDockerDiagnostics(signal)
      return { status: dockerStatus(data), count: data.containersFound, lastSync: data.lastDiscovery }
    }
    if (source === 'Coolify') {
      const data = await fetchCoolifySnapshot(signal)
      if (!validTime(data.checkedAt)) throw new Error('Invalid Coolify discovery timestamp')
      return { status: 'LIVE', count: new Set(data.projects.map((project) => project.id)).size, lastSync: data.checkedAt }
    }
    const data = await fetchProxmoxSnapshot(signal)
    if (!validTime(data.checkedAt)) throw new Error('Invalid Proxmox discovery timestamp')
    return {
      status: proxmoxStatus(data),
      count: data.source === 'live' ? new Set(data.resources.filter((resource) => resource.type === 'qemu').map((resource) => resource.id)).size : null,
      lastSync: data.source === 'live' ? data.checkedAt : null,
    }
  } catch (error) {
    if (signal.aborted) throw error
    console.warn(`${source} operational status unavailable:`, error)
    if (error instanceof Error && /^(Coolify discovery|Proxmox discovery) returned 503$/.test(error.message)) return { status: 'OFFLINE', count: null, lastSync: null }
    return { status: 'UNKNOWN', count: null, lastSync: null }
  }
}
