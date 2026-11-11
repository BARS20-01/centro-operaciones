import type { TwinView } from './view'
import { CORE_ID } from '../../domain/graph'
import type { Health, Layer, Topology } from '@/types'

export interface Size {
  w: number
  h: number
}
export interface Box extends Size {
  /** Center coordinates (nodes are rendered with origin [0.5, 0.5]). */
  x: number
  y: number
}
export interface ClusterBox extends Box {
  id: string
  parent: string
  count: number
}
export interface Layout {
  boxes: Map<string, Box>
  clusters: ClusterBox[]
  /** Nodes laid out inside a cluster; they connect through it, not individually. */
  clustered: Set<string>
}

export type NodeOrientation = 'vertical' | 'horizontal'

export const NODE_SIZE: Size = { w: 176, h: 48 }
export const CORE_SIZE = 300

const GAP_X = 28
const GAP_Y = 80
const CELL_GAP_X = 14
const CELL_GAP_Y = 12
const CLUSTER_PAD = 14
const CLUSTER_HEAD = 26
const CLUSTER_GAP = 46
const GRID_MIN = 10

const colsFor = (n: number) => Math.max(2, Math.ceil(Math.sqrt(n * 1.2)))

/**
 * Tidy top-down tree: subtree widths are measured bottom-up so branches
 * never overlap. Hosts whose children are all leaves (10+) switch to a
 * compact grid inside a cluster, which keeps hundreds of nodes readable.
 */
export function computeLayout(view: TwinView, sizeOf: (id: string) => Size): Layout {
  const kidsOf = (id: string) => view.kids.get(id) ?? []
  const isGrid = (id: string) => {
    const k = kidsOf(id)
    return k.length >= GRID_MIN && k.every((c) => kidsOf(c).length === 0)
  }

  const gridWidth = (id: string) => {
    const k = kidsOf(id)
    const cols = colsFor(k.length)
    return cols * sizeOf(k[0]).w + (cols - 1) * CELL_GAP_X + CLUSTER_PAD * 2
  }

  const widths = new Map<string, number>()
  const measure = (id: string): number => {
    const own = sizeOf(id).w
    const k = kidsOf(id)
    let w = own
    if (k.length) {
      w = isGrid(id)
        ? Math.max(own, gridWidth(id))
        : Math.max(own, k.reduce((s, c) => s + measure(c), 0) + GAP_X * (k.length - 1))
    }
    widths.set(id, w)
    return w
  }

  const boxes = new Map<string, Box>()
  const depth = new Map<string, number>()
  const gridHosts: string[] = []
  const clustered = new Set<string>()

  const place = (id: string, left: number, d: number) => {
    const size = sizeOf(id)
    const width = widths.get(id)!
    const cx = left + width / 2
    boxes.set(id, { ...size, x: cx, y: 0 })
    depth.set(id, d)
    const k = kidsOf(id)
    if (!k.length) return

    if (isGrid(id)) {
      gridHosts.push(id)
      const cols = colsFor(k.length)
      const cell = sizeOf(k[0])
      const blockLeft = cx - gridWidth(id) / 2 + CLUSTER_PAD
      k.forEach((c, i) => {
        clustered.add(c)
        boxes.set(c, { ...sizeOf(c), x: blockLeft + (i % cols) * (cell.w + CELL_GAP_X) + cell.w / 2, y: i / cols })
      })
      return
    }
    let x = left + (width - (k.reduce((s, c) => s + widths.get(c)!, 0) + GAP_X * (k.length - 1))) / 2
    for (const c of k) {
      place(c, x, d + 1)
      x += widths.get(c)! + GAP_X
    }
  }

  let cursor = 0
  for (const r of view.roots) {
    const w = measure(r)
    place(r, cursor, 0)
    cursor += w + GAP_X
  }

  // Row heights come from regular (non-clustered) nodes only.
  const rowH: number[] = []
  for (const [id, d] of depth) rowH[d] = Math.max(rowH[d] ?? 0, boxes.get(id)!.h)
  const rowY: number[] = []
  rowH.forEach((h, d) => {
    rowY[d] = d === 0 ? h / 2 : rowY[d - 1] + rowH[d - 1] / 2 + GAP_Y + h / 2
  })
  for (const [id, d] of depth) boxes.get(id)!.y = rowY[d]

  const clusters: ClusterBox[] = []
  for (const host of gridHosts) {
    const hb = boxes.get(host)!
    const k = kidsOf(host)
    const cols = colsFor(k.length)
    const rows = Math.ceil(k.length / cols)
    const cell = sizeOf(k[0])
    const top = hb.y + hb.h / 2 + CLUSTER_GAP
    const height = CLUSTER_HEAD + rows * cell.h + (rows - 1) * CELL_GAP_Y + CLUSTER_PAD
    clusters.push({ id: `cluster:${host}`, parent: host, count: k.length, x: hb.x, y: top + height / 2, w: gridWidth(host), h: height })
    k.forEach((c) => {
      const b = boxes.get(c)!
      b.y = top + CLUSTER_HEAD + Math.floor(b.y) * (cell.h + CELL_GAP_Y) + cell.h / 2
    })
  }

  return { boxes, clusters, clustered }
}

/** Knowledge-graph view: stable layer columns, with all hosting and dependency edges retained. */
export function computeKnowledgeLayout(view: TwinView, topology: Topology, sizeOf: (id: string) => Size): Layout {
  const layerOrder: Layer[] = ['infrastructure', 'services', 'applications', 'labs']
  const byLayer = new Map(layerOrder.map((layer) => [layer, [] as string[]]))
  for (const id of view.order) byLayer.get(topology.layers[id])?.push(id)

  const boxes = new Map<string, Box>()
  const columnGap = 260
  const rowGap = 94
  for (const layer of layerOrder) {
    const ids = byLayer.get(layer)!
    ids.sort((a, b) => {
      if (a === CORE_ID) return -1
      if (b === CORE_ID) return 1
      return a < b ? -1 : a > b ? 1 : 0
    })
    ids.forEach((id, row) => {
      const size = sizeOf(id)
      boxes.set(id, { ...size, x: (layerOrder.indexOf(layer) - 1.5) * columnGap, y: row * rowGap })
    })
  }
  return { boxes, clusters: [], clustered: new Set() }
}

/** Physical hosting view: rotate the hierarchical layout to flow from host to guest. */
export function computeHomelabLayout(view: TwinView, sizeOf: (id: string) => Size): Layout {
  const swappedSize = (id: string) => {
    const size = sizeOf(id)
    return { w: size.h, h: size.w }
  }
  const tree = computeLayout(view, swappedSize)
  return {
    boxes: new Map([...tree.boxes].map(([id, box]) => [id, { w: box.h, h: box.w, x: box.y, y: box.x }])),
    clusters: tree.clusters.map((box) => ({ ...box, x: box.y, y: box.x, w: box.h, h: box.w })),
    clustered: tree.clustered,
  }
}

/** Operations view: compact severity-sorted matrix around the shared Digital Core. */
export function computeOperationsLayout(view: TwinView, health: ReadonlyMap<string, Health>, sizeOf: (id: string) => Size): Layout {
  const priority: Record<Health, number> = { critical: 0, offline: 1, impacted: 2, warn: 3, ok: 4 }
  const ids = view.order.filter((id) => id !== CORE_ID)
  ids.sort((a, b) => (priority[health.get(a) ?? 'ok'] - priority[health.get(b) ?? 'ok']) || (a < b ? -1 : a > b ? 1 : 0))

  const columns = Math.max(1, Math.ceil(Math.sqrt(ids.length)))
  const size = ids.length ? sizeOf(ids[0]) : NODE_SIZE
  const gapX = 28
  const gapY = 20
  const hasCore = view.parent.has(CORE_ID)
  const coreSize = hasCore ? sizeOf(CORE_ID) : { w: 0, h: 0 }
  const gridWidth = Math.max(coreSize.w, columns * size.w + Math.max(0, columns - 1) * gapX)
  const boxes = new Map<string, Box>()
  if (hasCore) boxes.set(CORE_ID, { ...coreSize, x: gridWidth / 2, y: coreSize.h / 2 })

  ids.forEach((id, index) => {
    const nodeSize = sizeOf(id)
    const row = Math.floor(index / columns)
    const col = index % columns
    boxes.set(id, {
      ...nodeSize,
      x: col * (size.w + gapX) + nodeSize.w / 2,
      y: coreSize.h + 118 + row * (size.h + gapY),
    })
  })
  return { boxes, clusters: [], clustered: new Set() }
}
