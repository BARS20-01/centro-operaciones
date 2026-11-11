import type { DiscoveryResult, NodeInput } from '@/domain/graph'
import type { Status } from '@/types'
import type { Integration } from './types'

interface Resource {
  id: string
  type: 'node' | 'qemu' | 'lxc' | 'storage'
  name: string
  node: string
  vmid: number | null
  status: string | null
  cpu: number | null
  memory: number | null
  maxMemory: number | null
  disk: number | null
  maxDisk: number | null
  uptime: number | null
}

export interface ProxmoxSnapshot {
  source: 'live' | 'simulated'
  checkedAt: string
  resources: Resource[]
  snapshots: { vmid: number; type: 'qemu' | 'lxc'; name: string; createdAt: number | null }[]
  backups: { node: string; storage: string; vmid: number | null; createdAt: number | null; size: number | null }[]
  snapshotErrors: number
  backupErrors: number
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0
const nullableNumber = (value: unknown) => value === null || isNumber(value)
const nullableString = (value: unknown) => value === null || typeof value === 'string'

function isSnapshot(value: unknown): value is ProxmoxSnapshot {
  return isRecord(value) && (value.source === 'live' || value.source === 'simulated') && typeof value.checkedAt === 'string' &&
    isNumber(value.snapshotErrors) && isNumber(value.backupErrors) &&
    Array.isArray(value.resources) && value.resources.every((item: unknown) =>
      isRecord(item) && typeof item.id === 'string' && ['node', 'qemu', 'lxc', 'storage'].includes(String(item.type)) &&
      typeof item.name === 'string' && typeof item.node === 'string' && nullableString(item.status) &&
      ['vmid', 'cpu', 'memory', 'maxMemory', 'disk', 'maxDisk', 'uptime'].every((field) => nullableNumber(item[field]))) &&
    Array.isArray(value.snapshots) && value.snapshots.every((item: unknown) =>
      isRecord(item) && isNumber(item.vmid) && (item.type === 'qemu' || item.type === 'lxc') &&
      typeof item.name === 'string' && nullableNumber(item.createdAt)) &&
    Array.isArray(value.backups) && value.backups.every((item: unknown) =>
      isRecord(item) && typeof item.node === 'string' && typeof item.storage === 'string' &&
      nullableNumber(item.vmid) && nullableNumber(item.createdAt) && nullableNumber(item.size))
}

export async function fetchProxmoxHealth(signal?: AbortSignal, apiPath = '/api'): Promise<'live' | 'simulated'> {
  const response = await fetch(`${apiPath}/proxmox/health`, { signal, headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`Proxmox health returned ${response.status}`)
  const body: unknown = await response.json()
  if (!isRecord(body) || body.status !== 'OK' || (body.source !== 'live' && body.source !== 'simulated') || typeof body.checkedAt !== 'string') {
    throw new Error('Invalid Proxmox health response')
  }
  return body.source
}

export async function fetchProxmoxSnapshot(signal?: AbortSignal, apiPath = '/api'): Promise<ProxmoxSnapshot> {
  const response = await fetch(`${apiPath}/proxmox/discovery`, { signal, headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`Proxmox discovery returned ${response.status}`)
  const body: unknown = await response.json()
  if (!isSnapshot(body)) throw new Error('Invalid Proxmox discovery response')
  return body
}

function statusOf(resource: Resource): Status {
  if (resource.status === 'offline' || resource.status === 'stopped' || resource.status === 'unavailable') return 'offline'
  if (resource.status !== 'online' && resource.status !== 'running' && resource.status !== 'available') return 'warn'
  const ratios = [resource.cpu, resource.maxMemory && resource.memory !== null ? resource.memory / resource.maxMemory : null,
    resource.maxDisk && resource.disk !== null ? resource.disk / resource.maxDisk : null]
  if (ratios.some((ratio) => ratio !== null && ratio >= 0.95)) return 'critical'
  if (ratios.some((ratio) => ratio !== null && ratio >= 0.85)) return 'warn'
  return 'ok'
}

export function proxmoxNodes(snapshot: ProxmoxSnapshot): NodeInput[] {
  if (snapshot.source !== 'live') return []
  const shared = { origin: 'discovered' as const, source: 'live' as const, sourceSystem: 'proxmox' as const }
  const resources = new Map<string, Resource>()
  for (const item of snapshot.resources) {
    if ((item.type === 'qemu' || item.type === 'lxc') && (!Number.isSafeInteger(item.vmid) || !item.vmid || item.vmid < 0)) {
      throw new Error(`Invalid Proxmox VM identity: ${item.id}`)
    }
    const expectedId = item.type === 'node' ? `node/${item.node}` :
      item.type === 'storage' ? `storage/${item.node}/${item.name}` : `${item.type}/${item.vmid}`
    if (item.id !== expectedId) throw new Error(`Invalid Proxmox resource identity: ${item.id}`)
    const existing = resources.get(expectedId)
    if (existing) {
      const fields: (keyof Resource)[] = ['type', 'name', 'node', 'vmid', 'status', 'cpu', 'memory', 'maxMemory', 'disk', 'maxDisk', 'uptime']
      if (fields.some((field) => existing[field] !== item[field])) throw new Error(`Conflicting Proxmox resource identity: ${expectedId}`)
    } else resources.set(expectedId, item)
  }
  const nodes: NodeInput[] = []
  const hosts = new Set([...resources.values()].filter((r) => r.type === 'node').map((r) => r.node))
  const hostId = (name: string) => name === 'proxmox' ? 'proxmox' : `proxmox-node/${name}`
  for (const item of [...resources.values()].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)) {
    if (item.type !== 'node' && !hosts.has(item.node)) continue
    if (item.type === 'qemu' && item.vmid === 100 && item.status === 'stopped') continue
    const isCore = item.type === 'qemu' && item.vmid === 200 && item.node === 'proxmox'
    const id = item.type === 'node' ? hostId(item.node) : isCore ? 'vps-web' : `proxmox-${item.id}`
    const metrics = item.cpu !== null && item.memory !== null && item.maxMemory && item.uptime !== null
      ? { cpuPercent: Math.round(item.cpu * 1000) / 10, memPercent: Math.round(item.memory / item.maxMemory * 1000) / 10,
        memBytes: item.memory, uptimeSec: item.uptime }
      : undefined
    nodes.push({
      ...shared, id, name: isCore ? 'NEXUS CORE' : item.name, kind: isCore ? 'vps' : item.type === 'node' ? 'proxmox' : 'generic',
      layer: 'infrastructure', parentId: item.type === 'node' ? null : hostId(item.node),
      status: statusOf(item), category: item.type === 'node' ? 'Proxmox node' : item.type === 'storage' ? 'Proxmox storage' : `Proxmox ${item.type.toUpperCase()} ${item.vmid}`,
      currentStatus: item.status ?? undefined, metrics,
      diskPercent: item.disk !== null && item.maxDisk ? Math.round(item.disk / item.maxDisk * 1000) / 10 : undefined,
      description: isCore ? 'VPS-WEB · Proxmox VM 200' : undefined,
    })
  }
  return nodes
}

export function createProxmoxIntegration(): Integration {
  let known = new Set<string>()
  let source: 'live' | 'simulated' | undefined
  return {
    id: 'proxmox', name: 'Proxmox VE', description: 'Hipervisor y VMs', feeds: 'infrastructure',
    get source() { return source },
    async ping() {
      try { await fetchProxmoxSnapshot(); return true } catch { return false }
    },
    async discover(): Promise<DiscoveryResult> {
      const snapshot = await fetchProxmoxSnapshot()
      if (snapshot.source === 'simulated') {
        source = snapshot.source
        return { nodes: [] }
      }
      const nodes = proxmoxNodes(snapshot)
      const ids = new Set(nodes.map((node) => node.id))
      const removed = [...known].filter((id) => !ids.has(id) && id !== 'vps-web' && !id.startsWith('proxmox-node/'))
      known = ids
      source = snapshot.source
      return { nodes, removed }
    },
  }
}

export const proxmoxIntegration = createProxmoxIntegration()
