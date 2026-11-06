import type { Status, TwinGraph, TwinNode } from '@/types'

export interface DepIndex {
  /** id -> nodes it depends on */
  uses: Map<string, string[]>
  /** id -> nodes that depend on it */
  usedBy: Map<string, string[]>
}

export function depIndex(graph: TwinGraph): DepIndex {
  const uses = new Map<string, string[]>()
  const usedBy = new Map<string, string[]>()
  for (const d of graph.dependencies) {
    uses.set(d.from, [...(uses.get(d.from) ?? []), d.to])
    usedBy.set(d.to, [...(usedBy.get(d.to) ?? []), d.from])
  }
  return { uses, usedBy }
}

export const isFailing = (s: Status) => s === 'critical' || s === 'offline'

/** Everything a node needs in order to work: its host plus its dependencies. */
export function upstream(graph: TwinGraph, idx: DepIndex, id: string): string[] {
  const host = graph.nodes[id]?.parentId
  const deps = idx.uses.get(id) ?? []
  return host ? [host, ...deps] : deps
}

/** Maps each node with a failing upstream (host or dependency, transitively) to the failing root cause. */
export function computeImpact(graph: TwinGraph): Map<string, string> {
  const idx = depIndex(graph)
  const memo = new Map<string, string | null>()
  const visiting = new Set<string>()

  const cause = (id: string): string | null => {
    if (memo.has(id)) return memo.get(id)!
    if (visiting.has(id)) return null
    visiting.add(id)
    let found: string | null = null
    for (const u of upstream(graph, idx, id)) {
      const node = graph.nodes[u]
      if (!node) continue
      if (isFailing(node.status)) {
        found = u
        break
      }
      const c = cause(u)
      if (c) {
        found = c
        break
      }
    }
    visiting.delete(id)
    memo.set(id, found)
    return found
  }

  const out = new Map<string, string>()
  for (const id of Object.keys(graph.nodes)) {
    const c = cause(id)
    if (c) out.set(id, c)
  }
  return out
}

function reach(start: string, next: (id: string) => string[]): Set<string> {
  const seen = new Set<string>()
  const stack = [...next(start)]
  while (stack.length) {
    const id = stack.pop()!
    if (seen.has(id)) continue
    seen.add(id)
    stack.push(...next(id))
  }
  seen.delete(start)
  return seen
}

/** Root-to-node chain of hosts, including the node itself. */
export function hostPath(graph: TwinGraph, id: string): TwinNode[] {
  const path: TwinNode[] = []
  for (let cur: string | null = id; cur && graph.nodes[cur] && path.length < 64; cur = graph.nodes[cur].parentId) {
    path.unshift(graph.nodes[cur])
  }
  return path
}

/** Nodes that stop working if `id` fails: hosted subtree plus transitive dependents. */
export function affectedBy(graph: TwinGraph, id: string): string[] {
  const idx = depIndex(graph)
  return [...reach(id, (n) => [...(graph.children[n] ?? []), ...(idx.usedBy.get(n) ?? [])])]
}

/** Full neighbourhood of a node, used to highlight it on the map. */
export function relatedSet(graph: TwinGraph, id: string): Set<string> {
  const idx = depIndex(graph)
  const related = new Set<string>([id])
  const add = (s: Set<string>) => s.forEach((x) => related.add(x))
  add(reach(id, (n) => (graph.nodes[n]?.parentId ? [graph.nodes[n].parentId!] : [])))
  add(reach(id, (n) => graph.children[n] ?? []))
  add(reach(id, (n) => idx.uses.get(n) ?? []))
  add(reach(id, (n) => idx.usedBy.get(n) ?? []))
  return related
}
