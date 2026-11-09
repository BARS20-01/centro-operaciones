import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

type State = 'running' | 'restarting' | 'paused' | 'exited' | 'dead'

export interface Container {
  id: string
  name: string
  image: string
  state: State
  startedAt: string
  ports: string[]
  networks: string[]
  dependsOn: string[]
  cpuPercent: number
  memBytes: number
  memLimitBytes: number
  memoryBytes: number
  memoryLimitBytes: number
  memoryPercent: number
  status: State
  cpu: number
  ram: { bytes: number; limitBytes: number; percent: number }
  uptime: number
}

export type DockerCommand = (args: string[]) => Promise<string>

export interface ContainerStats {
  id: string
  name: string
  cpu: number
  memory: number
  memoryLimit: number
  memoryPercent: number
}

const execFileAsync = promisify(execFile)
export const dockerCommand: DockerCommand = async (args) => {
  const { stdout } = await execFileAsync('docker', args, { timeout: 12_000, maxBuffer: 16 * 1024 * 1024, windowsHide: true })
  return stdout
}

export async function dockerServerVersion(run: DockerCommand = dockerCommand): Promise<string> {
  const version = (await run(['version', '--format', '{{.Server.Version}}'])).trim()
  if (!version) throw new Error('Docker Engine version unavailable')
  return version
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid Docker JSON object')
  return value as Record<string, unknown>
}

function string(value: unknown): string {
  if (typeof value !== 'string' || !value) throw new Error('Missing Docker field')
  return value
}

function lines(output: string): Record<string, unknown>[] {
  return output.trim() ? output.trim().split(/\r?\n/).map((line) => object(JSON.parse(line))) : []
}

function bytes(value: string): number {
  const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*(B|[KMGTPE]i?B)$/i)
  if (!match) throw new Error(`Invalid Docker memory value: ${value}`)
  const unit = match[2].toUpperCase()
  const power = 'KMGTPE'.indexOf(unit[0]) + 1
  return Number(match[1]) * (unit.includes('I') ? 1024 : 1000) ** power
}

function percent(value: unknown): number {
  const match = string(value).trim().match(/^(\d+(?:\.\d+)?)%$/)
  if (!match) throw new Error('Invalid Docker CPU percentage')
  return Number(match[1])
}

function state(value: unknown): State {
  switch (string(value).toLowerCase()) {
    case 'running': return 'running'
    case 'restarting': return 'restarting'
    case 'paused': return 'paused'
    case 'exited':
    case 'created': return 'exited'
    case 'dead':
    case 'removing': return 'dead'
    default: throw new Error(`Unknown Docker container state: ${String(value)}`)
  }
}

function stringArray(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  return Object.keys(value as Record<string, unknown>)
}

function containerPorts(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  const ports = value as Record<string, unknown>
  return Object.entries(ports).flatMap(([containerPort, rawBindings]) => {
    if (!Array.isArray(rawBindings) || rawBindings.length === 0) return [containerPort]
    return rawBindings.map((rawBinding) => {
      const binding = object(rawBinding)
      const hostIp = typeof binding.HostIp === 'string' ? binding.HostIp : ''
      const hostPort = typeof binding.HostPort === 'string' ? binding.HostPort : ''
      return hostPort ? `${hostIp ? `${hostIp}:` : ''}${hostPort} → ${containerPort}` : containerPort
    })
  })
}

function composeDependencies(labelsValue: unknown, linksValue: unknown): string[] {
  const labels =
    labelsValue && typeof labelsValue === 'object' && !Array.isArray(labelsValue)
      ? (labelsValue as Record<string, unknown>)
      : {}
  const compose = typeof labels['com.docker.compose.depends_on'] === 'string'
    ? labels['com.docker.compose.depends_on'].split(',').map((item) => item.split(':')[0].trim()).filter(Boolean)
    : []
  const links = Array.isArray(linksValue)
    ? linksValue.filter((link): link is string => typeof link === 'string').map((link) => link.split(':')[0].replace(/^\//, ''))
    : []
  return [...new Set([...compose, ...links])]
}

function batches<T>(items: T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size))
  return result
}

export async function listContainers(run: DockerCommand = dockerCommand): Promise<Container[]> {
  const listed = lines(await run(['ps', '--all', '--no-trunc', '--format', '{{json .}}']))
  if (!listed.length) return []

  const entries = listed.map((row) => ({
    id: string(row.ID),
    name: string(row.Names),
    image: string(row.Image),
    state: state(row.State),
  }))
  const inspectedById = new Map<string, Record<string, unknown>>()
  for (const batch of batches(entries, 100)) {
    const inspected: unknown = JSON.parse(await run(['inspect', ...batch.map((entry) => entry.id)]))
    if (!Array.isArray(inspected)) throw new Error('Invalid Docker inspect response')
    for (const raw of inspected) {
      const item = object(raw)
      inspectedById.set(string(item.Id), item)
    }
  }

  const running = entries.filter((entry) => entry.state === 'running')
  const readings = new Map<string, { cpuPercent: number; memBytes: number; memLimitBytes: number }>()
  for (const batch of batches(running, 100)) {
    const stats = lines(
      await run(['stats', '--no-stream', '--no-trunc', '--format', '{{json .}}', ...batch.map((entry) => entry.id)]),
    )
    for (const row of stats) {
      const id = string(row.ID)
      const parts = string(row.MemUsage).split('/')
      if (parts.length !== 2) throw new Error('Invalid Docker memory usage')
      readings.set(id, { cpuPercent: percent(row.CPUPerc), memBytes: bytes(parts[0]), memLimitBytes: bytes(parts[1]) })
    }
  }

  const now = Date.now()
  const namesByService = new Map<string, string[]>()
  for (const entry of entries) {
    const item = inspectedById.get(entry.id)
    if (!item) continue
    const labels = object(item.Config).Labels
    const service = labels && typeof labels === 'object' && !Array.isArray(labels)
      ? (labels as Record<string, unknown>)['com.docker.compose.service']
      : undefined
    if (typeof service === 'string' && service) {
      namesByService.set(service, [...(namesByService.get(service) ?? []), entry.name])
    }
  }

  return entries.map((entry) => {
    const item = inspectedById.get(entry.id)
    if (!item) throw new Error(`Missing Docker inspect result for ${entry.id}`)
    const stateInfo = object(item.State)
    const startedAt = string(stateInfo.StartedAt)
    if (entry.state === 'running' && !Number.isFinite(Date.parse(startedAt))) throw new Error(`Invalid start time for ${entry.id}`)
    const metrics = readings.get(entry.id)
    if (entry.state === 'running' && !metrics) throw new Error(`Missing Docker stats for ${entry.id}`)
    const reading = metrics ?? { cpuPercent: 0, memBytes: 0, memLimitBytes: 0 }
    const networkSettings = object(item.NetworkSettings)
    const config = object(item.Config)
    const hostConfig = object(item.HostConfig)
    const dependsOn = composeDependencies(config.Labels, hostConfig.Links).flatMap(
      (dependency) => namesByService.get(dependency) ?? [dependency],
    )
    const memoryPercent = reading.memLimitBytes > 0
      ? Math.round((reading.memBytes / reading.memLimitBytes) * 1000) / 10
      : 0
    return {
      ...entry,
      startedAt,
      ports: containerPorts(networkSettings.Ports),
      networks: stringArray(networkSettings.Networks),
      dependsOn: [...new Set(dependsOn)],
      ...reading,
      memoryBytes: reading.memBytes,
      memoryLimitBytes: reading.memLimitBytes,
      memoryPercent,
      status: entry.state,
      cpu: reading.cpuPercent,
      ram: {
        bytes: reading.memBytes,
        limitBytes: reading.memLimitBytes,
        percent: memoryPercent,
      },
      uptime: entry.state === 'running' ? Math.max(0, Math.floor((now - Date.parse(startedAt)) / 1000)) : 0,
    }
  })
}

export async function listContainerStats(run: DockerCommand = dockerCommand): Promise<ContainerStats[]> {
  return containerStats(await listContainers(run))
}

export function containerStats(containers: Container[]): ContainerStats[] {
  return containers
    .filter((container) => container.state === 'running')
    .map((container) => ({
      id: container.id,
      name: container.name,
      cpu: container.cpu,
      memory: container.memoryBytes,
      memoryLimit: container.memoryLimitBytes,
      memoryPercent: container.memoryPercent,
    }))
}
