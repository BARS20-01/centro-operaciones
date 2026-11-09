import type { Dependency, Status, TwinGraph, TwinNode } from '@/types'

/** The pinned Digital Core: always visible regardless of filters. */
export const CORE_ID = 'vps-web'

export type NodeInput = Omit<TwinNode, 'origin'> & { origin?: TwinNode['origin'] }
export interface DependencyInput {
  from: string
  to: string
}

/** What any discovery source (Proxmox, Docker, Coolify...) hands to the twin. */
export interface DiscoveryResult {
  nodes?: NodeInput[]
  dependencies?: DependencyInput[]
  /** Ids to remove; their hosted subtree goes with them. */
  removed?: string[]
}

export interface MergeReport {
  graph: TwinGraph
  added: TwinNode[]
  removed: string[]
  rejected: { ref: string; reason: string }[]
}

export const emptyGraph: TwinGraph = {
  nodes: {},
  children: {},
  roots: [],
  topology: { children: {}, roots: [], layers: {} },
  dependencies: [],
}

function buildIndex(nodes: Record<string, TwinNode>) {
  const children: Record<string, string[]> = {}
  const layers: Record<string, TwinNode['layer']> = {}
  const roots: string[] = []
  for (const n of Object.values(nodes)) {
    layers[n.id] = n.layer
    if (n.parentId === null) roots.push(n.id)
    else (children[n.parentId] ??= []).push(n.id)
  }
  return { children, roots, topology: { children, roots, layers } }
}

function createsCycle(nodes: Record<string, TwinNode>, id: string, parentId: string | null) {
  for (let cur = parentId; cur; cur = nodes[cur]?.parentId ?? null) if (cur === id) return true
  return false
}

const sameMetrics = (a?: TwinNode['metrics'], b?: TwinNode['metrics']) =>
  a === b ||
  (!!a && !!b && a.cpuPercent === b.cpuPercent && a.memPercent === b.memPercent && a.memBytes === b.memBytes && a.uptimeSec === b.uptimeSec)

const sameStrings = (a?: string[], b?: string[]) =>
  a === b || (!!a && !!b && a.length === b.length && a.every((value, index) => value === b[index]))

const sameNode = (a: TwinNode, b: TwinNode) =>
  a.name === b.name &&
  a.kind === b.kind &&
  a.layer === b.layer &&
  a.status === b.status &&
  a.parentId === b.parentId &&
  a.origin === b.origin &&
  a.criticality === b.criticality &&
  a.description === b.description &&
  a.category === b.category &&
  a.repositoryUrl === b.repositoryUrl &&
  a.updatedAt === b.updatedAt &&
  a.source === b.source &&
  a.image === b.image &&
  a.startedAt === b.startedAt &&
  sameStrings(a.ports, b.ports) &&
  sameStrings(a.networks, b.networks) &&
  sameMetrics(a.metrics, b.metrics)

/**
 * Idempotent upsert of discovered nodes/relations. Nodes may arrive before
 * their host inside one batch (they are resolved iteratively); anything that
 * cannot be attached is reported instead of corrupting the graph. Returns
 * the same graph reference when nothing changed.
 */
export function mergeDiscovery(graph: TwinGraph, result: DiscoveryResult): MergeReport {
  const nodes = { ...graph.nodes }
  const added: TwinNode[] = []
  const removed: string[] = []
  const rejected: MergeReport['rejected'] = []
  let structural = false
  let changed = false

  const doomed = new Set((result.removed ?? []).filter((id) => nodes[id]))
  if (doomed.size) {
    let grew = true
    while (grew) {
      grew = false
      for (const n of Object.values(nodes)) {
        if (n.parentId && doomed.has(n.parentId) && !doomed.has(n.id)) {
          doomed.add(n.id)
          grew = true
        }
      }
    }
    for (const id of doomed) {
      delete nodes[id]
      removed.push(id)
    }
    structural = changed = true
  }

  let pending = result.nodes ?? []
  let progress = true
  while (pending.length && progress) {
    progress = false
    const next: NodeInput[] = []
    for (const input of pending) {
      if (input.parentId !== null && !nodes[input.parentId]) {
        next.push(input)
        continue
      }
      progress = true
      if (createsCycle(nodes, input.id, input.parentId)) {
        rejected.push({ ref: input.id, reason: 'hosts cycle' })
        continue
      }
      const existing = nodes[input.id]
      const node: TwinNode = {
        ...input,
        origin: input.origin ?? existing?.origin ?? 'declared',
        criticality: input.criticality ?? existing?.criticality,
      }
      if (existing && sameNode(existing, node)) continue
      nodes[node.id] = node
      changed = true
      if (!existing) added.push(node)
      if (!existing || existing.parentId !== node.parentId || existing.layer !== node.layer) structural = true
    }
    pending = next
  }
  for (const input of pending) rejected.push({ ref: input.id, reason: `unknown host "${input.parentId}"` })

  let dependencies = graph.dependencies
  if (removed.length) {
    dependencies = dependencies.filter((d) => !doomed.has(d.from) && !doomed.has(d.to))
  }
  const known = new Set(dependencies.map((d) => d.id))
  const appended: Dependency[] = []
  for (const d of result.dependencies ?? []) {
    const id = `${d.from}->${d.to}`
    if (d.from === d.to || !nodes[d.from] || !nodes[d.to]) {
      rejected.push({ ref: id, reason: 'invalid dependency endpoints' })
    } else if (!known.has(id)) {
      known.add(id)
      appended.push({ id, ...d })
    }
  }
  if (appended.length) {
    dependencies = [...dependencies, ...appended]
    changed = true
  }

  if (!changed) return { graph, added, removed, rejected }
  // Nonstructural updates must preserve the topology used by the layout.
  const index = structural
    ? buildIndex(nodes)
    : { children: graph.children, roots: graph.roots, topology: graph.topology }
  return { graph: { nodes, dependencies, ...index }, added, removed, rejected }
}

export function setStatus(graph: TwinGraph, id: string, status: Status): TwinGraph {
  const node = graph.nodes[id]
  if (!node || node.status === status) return graph
  return { ...graph, nodes: { ...graph.nodes, [id]: { ...node, status } } }
}
