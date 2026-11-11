import { CORE_ID } from '../../domain/graph'
import type { Layer, Topology, TwinGraph } from '@/types'

/** The visible tree after applying layer filters and branch collapsing. */
export interface TwinView {
  roots: string[]
  /** Visible children of each visible node (hidden nodes are contracted away). */
  kids: Map<string, string[]>
  parent: Map<string, string | null>
  /** Collapsed visible nodes -> number of nodes folded inside them. */
  hidden: Map<string, number>
  order: string[]
}

/**
 * Filtered-out nodes are contracted: their visible descendants reattach to
 * the nearest visible ancestor, so relationships stay readable. The core is
 * pinned against layer filters, but follows the source filter.
 */
export function buildView(topology: Topology, collapsed: ReadonlySet<string>, layers: ReadonlySet<Layer>, matches: (id: string) => boolean = () => true): TwinView {
  const view: TwinView = { roots: [], kids: new Map(), parent: new Map(), hidden: new Map(), order: [] }
  const isShown = (id: string) => matches(id) && (id === CORE_ID || layers.has(topology.layers[id]))

  const countShown = (id: string): number => {
    let n = 0
    for (const c of topology.children[id] ?? []) n += (isShown(c) ? 1 : 0) + countShown(c)
    return n
  }

  const walk = (id: string, anchor: string | null) => {
    const shown = isShown(id)
    let next = anchor
    if (shown) {
      view.order.push(id)
      view.parent.set(id, anchor)
      view.kids.set(id, [])
      if (anchor) view.kids.get(anchor)!.push(id)
      else view.roots.push(id)
      next = id
      if (collapsed.has(id)) {
        const n = countShown(id)
        if (n > 0) {
          view.hidden.set(id, n)
          return
        }
      }
    }
    for (const c of topology.children[id] ?? []) walk(c, next)
  }
  for (const r of topology.roots) walk(r, null)
  return view
}

/** Branches that start folded: huge fan-outs would otherwise flood the map. */
export function defaultCollapsed(graph: TwinGraph, threshold = 24): Set<string> {
  return new Set(Object.keys(graph.children).filter((id) => graph.children[id].length > threshold))
}

/** Everything below the core's direct children can be folded; the core path stays open. */
export function collapsibleBranches(graph: TwinGraph): Set<string> {
  const keep = new Set<string>()
  for (let cur: string | null = CORE_ID; cur; cur = graph.nodes[cur]?.parentId ?? null) keep.add(cur)
  return new Set(Object.keys(graph.children).filter((id) => !keep.has(id) && graph.children[id].length > 0))
}
