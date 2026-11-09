export type Status = 'ok' | 'warn' | 'critical' | 'offline'

/** Effective state: the reported status plus `impacted` (propagated by the engine, never reported). */
export type Health = Status | 'impacted'

export type Criticality = 'critical' | 'high' | 'medium' | 'low'

/** Filterable slice of the twin. Every node belongs to exactly one layer. */
export type Layer = 'infrastructure' | 'services' | 'applications' | 'labs'

/** Maps to an icon in features/topology/icons.ts */
export type NodeKind =
  | 'vps'
  | 'proxmox'
  | 'docker'
  | 'container'
  | 'coolify'
  | 'grafana'
  | 'uptime'
  | 'postgres'
  | 'sgs'
  | 'wallboard'
  | 'labscreen'
  | 'lab'
  | 'generic'

/** Runtime telemetry an integration may attach to the nodes it reports. */
export interface NodeMetrics {
  cpuPercent: number
  memPercent: number
  memBytes: number
  uptimeSec: number
}

export interface TwinNode {
  id: string
  name: string
  kind: NodeKind
  layer: Layer
  status: Status
  /** "hosts" relation: the node that runs/contains this one. Null for roots. */
  parentId: string | null
  origin: 'declared' | 'discovered'
  /** Business criticality; when absent it falls back to a per-layer default. */
  criticality?: Criticality
  description?: string
  category?: string
  repositoryUrl?: string
  updatedAt?: string
  source?: 'live' | 'simulated'
  image?: string
  ports?: string[]
  networks?: string[]
  startedAt?: string
  metrics?: NodeMetrics
}

/** "depends_on" relation: `from` needs `to` to work. */
export interface Dependency {
  id: string
  from: string
  to: string
}

/**
 * Normalised digital-twin graph. `hosts` is encoded as `parentId` (a tree,
 * one host per node) and `depends_on` as a separate edge list (any shape).
 * `children` and `roots` are derived indexes, rebuilt only on structural
 * changes so status updates keep their identity.
 */
export interface TwinGraph {
  nodes: Record<string, TwinNode>
  children: Record<string, string[]>
  roots: string[]
  /** Structure-only view of the graph; keeps its identity across status/metric updates. */
  topology: Topology
  dependencies: Dependency[]
}

export interface Topology {
  children: Record<string, string[]>
  roots: string[]
  layers: Record<string, Layer>
}

export interface Kpi {
  id: 'cpu' | 'ram' | 'disk' | 'services'
  label: string
  value: number
  unit: string
  /** 0-100, used for the gauge */
  percent: number
  status: Status
  history: number[]
}

export type EventSeverity = 'info' | 'success' | 'warn' | 'error'

export type EventCategory = 'infrastructure' | 'applications' | 'labs' | 'security'

export interface OpsEvent {
  id: string
  timestamp: number
  source: string
  severity: EventSeverity
  category: EventCategory
  message: string
}

export interface Snapshot {
  kpis: Kpi[]
  graph: TwinGraph
}
