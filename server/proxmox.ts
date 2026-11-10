export interface ProxmoxResource {
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
  resources: ProxmoxResource[]
  snapshots: { vmid: number; type: 'qemu' | 'lxc'; name: string; createdAt: number | null }[]
  backups: { node: string; storage: string; vmid: number | null; createdAt: number | null; size: number | null }[]
  snapshotErrors: number
  backupErrors: number
}

export interface ProxmoxTransport {
  discover(): Promise<ProxmoxSnapshot>
  health(): Promise<{ source: 'live' | 'simulated'; checkedAt: string }>
}

export class ProxmoxError extends Error {
  constructor(public readonly code: 'INVALID_CONFIGURATION' | 'UPSTREAM_HTTP' | 'UPSTREAM_UNREACHABLE' | 'INVALID_RESPONSE', public readonly status?: number) {
    super(code)
  }
}

type JsonRecord = Record<string, unknown>

function record(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ProxmoxError('INVALID_RESPONSE')
  return value as JsonRecord
}

function list(value: unknown): unknown[] {
  const data = record(value).data
  if (!Array.isArray(data)) throw new ProxmoxError('INVALID_RESPONSE')
  return data
}

function safeName(value: unknown): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 200 || [...value].some((char) => char.charCodeAt(0) < 32)) {
    throw new ProxmoxError('INVALID_RESPONSE')
  }
  return value
}

function pathName(value: unknown): string {
  const result = safeName(value)
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(result)) throw new ProxmoxError('INVALID_RESPONSE')
  return result
}

function numeric(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

function resource(value: unknown): ProxmoxResource | null {
  const item = record(value)
  if (item.type !== 'node' && item.type !== 'qemu' && item.type !== 'lxc' && item.type !== 'storage') return null
  const node = pathName(item.node)
  const vmid = numeric(item.vmid)
  if ((item.type === 'qemu' || item.type === 'lxc') && (!vmid || !Number.isSafeInteger(vmid))) throw new ProxmoxError('INVALID_RESPONSE')
  const name = item.type === 'storage' ? pathName(item.storage) : safeName(item.type === 'node' ? item.node : item.name ?? String(vmid))
  const status = typeof item.status === 'string' && /^[a-zA-Z0-9_-]{1,32}$/.test(item.status) ? item.status : null
  return {
    id: item.type === 'node' ? `node/${node}` : item.type === 'storage' ? `storage/${node}/${name}` : `${item.type}/${vmid}`,
    type: item.type, node, name, vmid, status, cpu: numeric(item.cpu), memory: numeric(item.mem),
    maxMemory: numeric(item.maxmem), disk: numeric(item.disk), maxDisk: numeric(item.maxdisk), uptime: numeric(item.uptime),
  }
}

export function createProxmoxTransport(
  baseUrl: string,
  token: string,
  request: typeof fetch = fetch,
  options: { diagnosticLogs?: boolean; logger?: (message: string) => void } = {},
): ProxmoxTransport {
  let base: URL
  try { base = new URL(baseUrl) } catch { throw new ProxmoxError('INVALID_CONFIGURATION') }
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || base.pathname !== '/' ||
    !/^[^\s!=]+@[^\s!=]+![^\s=]+=[^\s=]+$/.test(token)) throw new ProxmoxError('INVALID_CONFIGURATION')
  base.pathname = `${base.pathname.replace(/\/+$/, '')}/api2/json/`
  const log = options.logger ?? ((message: string) => console.error(message))

  async function get(path: string, endpoint: string, deadline: AbortSignal): Promise<unknown[]> {
    const started = Date.now()
    if (options.diagnosticLogs) log(`Proxmox request: GET ${endpoint} result=STARTED`)
    let response: Response
    try {
      response = await request(new URL(path, base), {
        headers: { Accept: 'application/json', Authorization: `PVEAPIToken=${token}` },
        redirect: 'error', signal: AbortSignal.any([AbortSignal.timeout(15_000), deadline]),
      })
    } catch {
      log(`Proxmox response: GET ${endpoint} result=UPSTREAM_UNREACHABLE elapsed_ms=${Date.now() - started}`)
      throw new ProxmoxError('UPSTREAM_UNREACHABLE')
    }
    if (options.diagnosticLogs || !response.ok) log(`Proxmox response: GET ${endpoint} status=${response.status} elapsed_ms=${Date.now() - started}`)
    if (!response.ok) {
      throw new ProxmoxError('UPSTREAM_HTTP', response.status)
    }
    try {
      const entries = list(await response.json())
      if (options.diagnosticLogs) log(`Proxmox parse: GET ${endpoint} result=OK count=${entries.length}`)
      return entries
    } catch {
      log(`Proxmox parse: GET ${endpoint} result=INVALID_RESPONSE`)
      throw new ProxmoxError('INVALID_RESPONSE')
    }
  }

  return {
    async health() {
      await get('cluster/resources', '/cluster/resources', AbortSignal.timeout(15_000))
      return { source: 'live', checkedAt: new Date().toISOString() }
    },
    async discover() {
      const started = Date.now()
      if (options.diagnosticLogs) log('Proxmox discovery: result=STARTED')
      try {
        const deadline = AbortSignal.timeout(35_000)
        const entries = await get('cluster/resources', '/cluster/resources', deadline)
        let resources: ProxmoxResource[]
        try { resources = entries.map(resource).filter((entry): entry is ProxmoxResource => entry !== null) } catch {
          log('Proxmox parse: GET /cluster/resources result=INVALID_RESPONSE stage=resources')
          throw new ProxmoxError('INVALID_RESPONSE')
        }
        const jobs: Array<() => Promise<void>> = []
        const snapshots: ProxmoxSnapshot['snapshots'] = []
        const backups: ProxmoxSnapshot['backups'] = []
        let snapshotErrors = 0
        let backupErrors = 0
        for (const item of resources) {
          if (item.type === 'qemu' || item.type === 'lxc') {
            const type = item.type
            const vmid = item.vmid!
            jobs.push(async () => {
              if (deadline.aborted) { snapshotErrors++; return }
              try {
                const results = await get(`nodes/${encodeURIComponent(item.node)}/${type}/${vmid}/snapshot`, '/nodes/{node}/{type}/{vmid}/snapshot', deadline)
                const normalized = results.map((value) => record(value)).filter((value) => value.name !== 'current')
                  .map((value) => ({ vmid, type, name: safeName(value.name), createdAt: numeric(value.snaptime) }))
                snapshots.push(...normalized)
              } catch {
                snapshotErrors++
                log('Proxmox parse: stage=snapshots result=INCOMPLETE')
              }
            })
          } else if (item.type === 'storage' && item.status === 'available') {
            jobs.push(async () => {
              if (deadline.aborted) { backupErrors++; return }
              try {
                const results = await get(`nodes/${encodeURIComponent(item.node)}/storage/${encodeURIComponent(item.name)}/content?content=backup`, '/nodes/{node}/storage/{storage}/content', deadline)
                const normalized = results.map((value) => {
                  const entry = record(value)
                  return { node: item.node, storage: item.name, vmid: numeric(entry.vmid), createdAt: numeric(entry.ctime), size: numeric(entry.size) }
                })
                backups.push(...normalized)
              } catch {
                backupErrors++
                log('Proxmox parse: stage=backups result=INCOMPLETE')
              }
            })
          } else if (item.type === 'storage') {
            backupErrors++
            log('Proxmox discovery: stage=backups result=STORAGE_UNAVAILABLE')
          }
        }
        let next = 0
        await Promise.all(Array.from({ length: Math.min(5, jobs.length) }, async () => {
          while (next < jobs.length) await jobs[next++]()
        }))
        if (deadline.aborted) log('Proxmox discovery: result=DEADLINE_EXCEEDED inventory=INCOMPLETE')
        if (options.diagnosticLogs) {
          log(`Proxmox parse: stage=normalized resources=${resources.length} snapshots=${snapshots.length} backups=${backups.length}`)
        }
        if (options.diagnosticLogs || snapshotErrors || backupErrors) {
          log(`Proxmox discovery: result=${snapshotErrors || backupErrors ? 'PARTIAL' : 'SUCCESS'} snapshot_errors=${snapshotErrors} backup_errors=${backupErrors} elapsed_ms=${Date.now() - started}`)
        }
        return { source: 'live', checkedAt: new Date().toISOString(), resources, snapshots, backups, snapshotErrors, backupErrors }
      } catch (error) {
        log(`Proxmox discovery: result=${error instanceof ProxmoxError ? error.code : 'UNEXPECTED_ERROR'} elapsed_ms=${Date.now() - started}`)
        throw error
      }
    },
  }
}

export function createSimulatedProxmoxTransport(): ProxmoxTransport {
  return {
    async health() { return { source: 'simulated', checkedAt: new Date().toISOString() } },
    async discover() {
      return {
        source: 'simulated', checkedAt: new Date().toISOString(), resources: [], snapshots: [], backups: [],
        snapshotErrors: 0, backupErrors: 0,
      }
    },
  }
}
