import { CORE_ID, emptyGraph, mergeDiscovery, type NodeInput } from '@/domain/graph'
import { categoryOfLayer } from '@/domain/health'
import { statusFromPercent } from '@/lib/status'
import type { Criticality, EventSeverity, Kpi, OpsEvent, Snapshot, Status, TwinGraph } from '@/types'

const node = (
  id: string,
  name: string,
  kind: NodeInput['kind'],
  layer: NodeInput['layer'],
  parentId: string | null,
  criticality?: Criticality,
  status: Status = 'ok',
): NodeInput => ({ id, name, kind, layer, parentId, status, criticality })

const seedNodes: NodeInput[] = [
  node('proxmox', 'Proxmox', 'proxmox', 'infrastructure', null, 'critical'),
  node(CORE_ID, 'NEXUS CORE', 'vps', 'infrastructure', 'proxmox', 'critical'),
  node('docker', 'Docker', 'docker', 'infrastructure', CORE_ID, 'critical'),
  node('coolify', 'Coolify', 'coolify', 'services', CORE_ID, 'high'),
  node('grafana', 'Grafana', 'grafana', 'services', CORE_ID, 'medium', 'warn'),
  node('uptime-kuma', 'Uptime Kuma', 'uptime', 'services', CORE_ID, 'medium'),
  node('postgres', 'PostgreSQL', 'postgres', 'services', CORE_ID, 'high'),
  node('sgs', 'SGS', 'sgs', 'applications', CORE_ID, 'medium'),
  node('wallboard', 'Wallboard', 'wallboard', 'applications', CORE_ID, 'medium'),
  node('labscreen', 'LabScreen', 'labscreen', 'applications', CORE_ID, 'medium'),
  ...['ING101', 'ING201', 'ING202', 'ING203', 'ING204', 'ACA001'].map((n, i) =>
    node(n.toLowerCase(), n, 'lab', 'labs', 'labscreen', 'low', i === 3 ? 'warn' : i === 4 ? 'offline' : 'ok'),
  ),
]

const seedDependencies = [
  { from: 'sgs', to: 'postgres' },
  { from: 'wallboard', to: 'postgres' },
  { from: 'coolify', to: 'docker' },
]

/** `?stress=N` adds N extra lab nodes under LabScreen to exercise the layout at scale. */
function stressCount(): number {
  if (typeof location === 'undefined') return 0
  const n = Number(new URLSearchParams(location.search).get('stress'))
  return Number.isFinite(n) ? Math.min(Math.max(Math.floor(n), 0), 600) : 0
}

const seed = (base: number) => Array.from({ length: 24 }, (_, i) => base + Math.sin(i / 3) * 6)

const kpi = (id: Kpi['id'], label: string, unit: string, percent: number): Kpi => ({
  id,
  label,
  unit,
  value: percent,
  percent,
  status: statusFromPercent(percent),
  history: seed(percent),
})

/** Availability of services + applications; failing nodes count as inactive. */
export function servicesKpi(graph: TwinGraph, previous?: Kpi): Kpi {
  const all = Object.values(graph.nodes).filter((n) => n.layer === 'services' || n.layer === 'applications')
  const active = all.filter((n) => n.status === 'ok' || n.status === 'warn').length
  const percent = all.length ? (active / all.length) * 100 : 100
  return {
    id: 'services',
    label: 'Servicios activos',
    unit: `/ ${all.length}`,
    value: active,
    percent,
    status: percent >= 90 ? 'ok' : percent >= 70 ? 'warn' : 'critical',
    history: previous ? [...previous.history.slice(1), percent] : seed(percent),
  }
}

export function createInitialSnapshot(): Snapshot {
  const extra = Array.from({ length: stressCount() }, (_, i) =>
    node(`sim-${i}`, `NODE-${i + 1}`, 'generic', 'labs', 'labscreen', 'low'),
  )
  const { graph } = mergeDiscovery(emptyGraph, { nodes: [...seedNodes, ...extra], dependencies: seedDependencies })

  return {
    graph,
    kpis: [kpi('cpu', 'CPU', '%', 42), kpi('ram', 'RAM', '%', 61), kpi('disk', 'Disco', '%', 68), servicesKpi(graph)],
  }
}

interface EventTemplate {
  severity: EventSeverity
  message: string
}

export const eventTemplates: EventTemplate[] = [
  { severity: 'info', message: 'health-check OK · latencia {ms}ms' },
  { severity: 'info', message: 'telemetría sincronizada ({n} métricas)' },
  { severity: 'success', message: 'backup incremental completado' },
  { severity: 'success', message: 'certificado TLS verificado' },
  { severity: 'info', message: 'heartbeat recibido' },
]

export const securityTemplates: EventTemplate[] = [
  { severity: 'info', message: 'inicio de sesión administrativo' },
  { severity: 'info', message: 'política de firewall actualizada' },
  { severity: 'warn', message: 'intento de acceso SSH bloqueado ({n} IPs)' },
  { severity: 'warn', message: 'escaneo de puertos detectado' },
  { severity: 'warn', message: 'certificado expira en {d} días' },
  { severity: 'success', message: 'rotación de credenciales completada' },
  { severity: 'success', message: 'parche de seguridad aplicado' },
  { severity: 'error', message: 'múltiples fallos de autenticación' },
]
export const securitySources = ['Firewall', 'Auth', 'Vault']

const historyTemplates: EventTemplate[] = [
  ...eventTemplates,
  { severity: 'warn', message: 'degradación de rendimiento detectada' },
  { severity: 'warn', message: 'recuperación parcial' },
  { severity: 'success', message: 'servicio recuperado' },
  { severity: 'error', message: 'fallo crítico · sin respuesta' },
]

/** Fills `{ms}`, `{n}` and `{d}` placeholders with plausible simulated values. */
export const fillTemplate = (message: string) =>
  message
    .replace('{ms}', String(8 + Math.floor(Math.random() * 90)))
    .replace('{n}', String(20 + Math.floor(Math.random() * 200)))
    .replace('{d}', String(3 + Math.floor(Math.random() * 25)))

const pickOf = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)]

const SEVEN_DAYS = 7 * 24 * 3_600_000

/**
 * Simulated past week of operations, newest first. Density is biased towards
 * the present so every timeline range has something to show.
 */
export function seedHistory(graph: TwinGraph, now: number, count = 480): OpsEvent[] {
  const nodes = Object.values(graph.nodes)
  const events = Array.from({ length: count }, (_, i): OpsEvent => {
    const timestamp = now - SEVEN_DAYS * Math.pow(Math.random(), 2.5) - 15_000
    if (Math.random() < 0.14) {
      const t = pickOf(securityTemplates)
      return {
        id: `hist-${i}`,
        timestamp,
        source: pickOf(securitySources),
        severity: t.severity,
        category: 'security',
        message: fillTemplate(t.message),
      }
    }
    const n = pickOf(nodes)
    const t = pickOf(historyTemplates)
    return {
      id: `hist-${i}`,
      timestamp,
      source: n.name,
      severity: t.severity,
      category: categoryOfLayer(n.layer),
      message: fillTemplate(t.message),
    }
  })
  return events.sort((a, b) => b.timestamp - a.timestamp)
}
