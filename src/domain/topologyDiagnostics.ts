import type { TwinGraph } from '@/types'

export function topologyDiagnostics(graph: TwinGraph) {
  const nodes = Object.values(graph.nodes).map((node) => ({
    id: node.id,
    label: node.name,
    provider: node.sourceSystem ?? (node.source === 'simulated' ? 'seed' : 'unspecified'),
    source: node.source ?? 'unspecified',
    parentId: node.parentId,
    category: node.category ?? '',
  })).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  const byLabel = new Map<string, typeof nodes>()
  for (const node of nodes) {
    const key = node.label.trim().toLowerCase()
    if (!key) continue
    const group = byLabel.get(key) ?? []
    group.push(node)
    byLabel.set(key, group)
  }
  const duplicateLabels = [...byLabel.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([label, matches]) => ({ label, matches }))
    .sort((a, b) => a.label < b.label ? -1 : a.label > b.label ? 1 : 0)
  return { nodes, duplicateLabels }
}
