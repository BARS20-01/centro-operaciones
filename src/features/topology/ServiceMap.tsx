import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { MarkerType, ReactFlow, ReactFlowProvider, useNodesState, useReactFlow, type Node } from '@xyflow/react'
import { relatedSet } from '@/domain/analysis'
import { CORE_ID } from '@/domain/graph'
import { criticalityOf, HEALTH_LEVELS, type HealthReport } from '@/domain/health'
import type { ViewModeId } from '@/features/dashboard/viewModes'
import { useOperationalStatus } from '@/features/diagnostics/operationalStatusContext'
import { nodeSourceStatus } from '@/features/diagnostics/sourceManager'
import { LAYERS, healthColor } from '@/lib/status'
import type { Health, Layer, Status, TwinGraph, TwinNode } from '@/types'
import { TwinActions } from './actions'
import { ClusterNode, type ClusterNodeType } from './ClusterNode'
import { CoreNode, type CoreNodeType } from './CoreNode'
import { FlowEdge, type FlowEdgeType } from './FlowEdge'
import { Inspector } from './Inspector'
import { reconcileNodes } from './reconcileNodes'
import {
  computeHomelabLayout,
  computeKnowledgeLayout,
  computeLayout,
  computeOperationsLayout,
  CORE_SIZE,
  NODE_SIZE,
  type NodeOrientation,
} from './layout'
import { ServiceNode, type ServiceData, type ServiceFlags, type ServiceNodeType } from './ServiceNode'
import { Legend, Toolbar } from './Toolbar'
import { useTwinView } from './useTwinView'
import { buildView } from './view'
import { matchesSource } from '@/domain/sourceClassification'

const nodeTypes = { core: CoreNode, service: ServiceNode, cluster: ClusterNode }
const edgeTypes = { flow: FlowEdge }
const FIT = { padding: 0.06 }
const DEPENDENCY_COLOR = 'var(--theme-connection)'

const sizeOf = (id: string) => (id === CORE_ID ? { w: CORE_SIZE, h: CORE_SIZE } : NODE_SIZE)

// Stable data per node object + flags: unchanged nodes skip re-rendering.
const dataCache = new WeakMap<TwinNode, { sig: string; data: ServiceData }>()
function serviceData(node: TwinNode, flags: ServiceFlags): ServiceData {
  const sig = `${flags.health}|${flags.criticality}|${flags.orientation}|${flags.cause ?? ''}|${flags.dim}|${flags.selected}|${flags.expandable}|${flags.collapsed}|${flags.hiddenCount}`
  const hit = dataCache.get(node)
  if (hit?.sig === sig) return hit.data
  const data = { node, ...flags }
  dataCache.set(node, { sig, data })
  return data
}

const CORE_STATUS: Record<string, Status> = { optimal: 'ok', healthy: 'ok', degraded: 'warn', 'at-risk': 'warn', critical: 'critical' }
const isDown = (h: Health | undefined) => h === 'critical' || h === 'offline'

function Canvas({
  graph,
  report,
  mode,
}: {
  graph: TwinGraph
  report: HealthReport
  mode: ViewModeId
}) {
  const ui = useTwinView(graph)
  const { readings } = useOperationalStatus()
  const { fitView, getEdges, getInternalNode } = useReactFlow()
  const model = report.model

  const related = useMemo(() => (ui.selectedId ? relatedSet(graph, ui.selectedId) : null), [graph, ui.selectedId])
  // Topology keeps its identity across status/metric ticks, so layout only reruns on structural change.
  const view = useMemo(() => buildView(graph.topology, ui.collapsed, ui.layers, (id) => matchesSource(graph.nodes[id], ui.sourceFilter)), [graph, ui.collapsed, ui.layers, ui.sourceFilter])
  const operationHealth = mode === 'operations' ? model.health : EMPTY_HEALTH
  const layout = useMemo(() => {
    if (mode === 'obsidian') return computeKnowledgeLayout(view, graph.topology, sizeOf)
    if (mode === 'homelab') return computeHomelabLayout(view, sizeOf)
    if (mode === 'operations') return computeOperationsLayout(view, operationHealth, sizeOf)
    return computeLayout(view, sizeOf)
  }, [mode, view, graph.topology, operationHealth])
  const orientation: NodeOrientation = mode === 'homelab' ? 'horizontal' : 'vertical'

  const counts = useMemo(() => {
    const c = Object.fromEntries(LAYERS.map((l) => [l, { total: 0, alerts: 0 }])) as Record<Layer, { total: number; alerts: number }>
    for (const n of Object.values(graph.nodes)) {
      c[n.layer].total++
      if (model.health.get(n.id) !== 'ok') c[n.layer].alerts++
    }
    return c
  }, [graph, model])

  const { nodes: nextNodes, edges } = useMemo(() => {
    const nodes: Node[] = []
    const edges: FlowEdgeType[] = []
    const dimmed = (id: string) => !!related && !related.has(id)

    for (const c of layout.clusters) {
      nodes.push({
        id: c.id,
        type: 'cluster',
        position: { x: c.x, y: c.y },
        width: c.w,
        height: c.h,
        data: { label: graph.nodes[c.parent].name, count: c.count, orientation },
        className: 'pointer-events-none',
        selectable: false,
        draggable: false,
        focusable: false,
      } satisfies ClusterNodeType)
    }

    const level = report.nexus.level
    const edgeBudget = view.order.length
    const particles = edgeBudget <= 60 ? 3 : edgeBudget <= 150 ? 1 : 0

    view.order.forEach((id, i) => {
      const node = graph.nodes[id]
      const health = model.health.get(id) ?? node.status
      const box = layout.boxes.get(id)!
      const expandable = (view.kids.get(id)?.length ?? 0) > 0 || view.hidden.has(id)
      const flags = {
        dim: dimmed(id),
        expandable,
        collapsed: view.hidden.has(id),
        hiddenCount: view.hidden.get(id) ?? 0,
      }

      if (id === CORE_ID) {
        nodes.push({
          id,
          type: 'core',
          position: { x: box.x, y: box.y },
          initialWidth: CORE_SIZE,
          initialHeight: CORE_SIZE,
          data: { id, label: node.name, sourceClass: nodeSourceStatus(node, readings), status: CORE_STATUS[level], levelLabel: HEALTH_LEVELS[level].label, orientation, ...flags },
          draggable: false,
          zIndex: 1,
        } satisfies CoreNodeType)
      } else {
        const cause = model.causes.get(id)
        nodes.push({
          id,
          type: 'service',
          position: { x: box.x, y: box.y },
          initialWidth: NODE_SIZE.w,
          initialHeight: NODE_SIZE.h,
          data: serviceData(node, {
            ...flags,
            health,
            criticality: criticalityOf(node),
            orientation,
            selected: id === ui.selectedId,
            cause: cause ? graph.nodes[cause]?.name : undefined,
          }),
          draggable: false,
        } satisfies ServiceNodeType)
      }

      const parent = view.parent.get(id)
      if (parent && !layout.clustered.has(id)) {
        const impacted = health === 'impacted'
        edges.push({
          id: `h:${parent}>${id}`,
          source: parent,
          target: id,
          sourceHandle: 'out',
          targetHandle: 'in',
          type: 'flow',
          data: {
            kind: 'hosts',
            color: healthColor[health],
            particles: mode === 'operations' ? Math.max(particles, 2) : particles,
            duration: health === 'critical' ? 1.4 : impacted ? 2 : 2.6 + (i % 3) * 0.5,
            active: health !== 'offline',
            dim: !!related && !(related.has(parent) && related.has(id)),
            impact: impacted || isDown(health),
          },
        })
      }
    })

    for (const c of layout.clusters) {
      const ph = model.health.get(c.parent) ?? 'ok'
      edges.push({
        id: `h:${c.parent}>${c.id}`,
        source: c.parent,
        target: c.id,
        sourceHandle: 'out',
        targetHandle: 'in',
        type: 'flow',
        data: { kind: 'hosts', color: healthColor[ph], particles: 1, duration: 3, active: true, dim: dimmed(c.parent) },
      })
    }

    for (const d of graph.dependencies) {
      if (mode === 'homelab') continue
      if (!view.parent.has(d.from) || !view.parent.has(d.to)) continue
      const target = model.health.get(d.to)
      const down = isDown(target)
      const impacted = target === 'impacted'
      const color = down ? healthColor.critical : impacted ? healthColor.impacted : DEPENDENCY_COLOR
      edges.push({
        id: `d:${d.id}`,
        source: d.from,
        target: d.to,
        sourceHandle: 'dep-out',
        targetHandle: 'dep-in',
        type: 'flow',
        markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14 },
        data: {
          kind: 'depends',
          color,
          particles: 2,
          duration: down ? 2.4 : 2.8,
          active: true,
          dim: !!related && !(related.has(d.from) && related.has(d.to)),
          impact: down || impacted,
          reverse: down || impacted,
          emphasis: mode === 'obsidian',
        },
      })
    }
    return { nodes, edges }
  }, [graph, model, report.nexus.level, view, layout, related, ui.selectedId, mode, orientation, readings])

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  useLayoutEffect(() => {
    setNodes((current) => reconcileNodes(nextNodes, current))
  }, [nextNodes, setNodes])

  const lastTrace = useRef('')
  const canvasRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const timer = setTimeout(() => {
      const trace = {
        graphNodes: Object.keys(graph.nodes).sort(),
        graphHosts: Object.values(graph.nodes).filter((node) => node.parentId).map((node) => `${node.parentId}>${node.id}`).sort(),
        graphDependencies: graph.dependencies.map((edge) => edge.id).sort(),
        visibleNodes: nodes.map((node) => node.id).sort(),
        calculatedEdges: edges.map((edge) => edge.id).sort(),
        flowEdges: getEdges().map((edge) => edge.id).sort(),
        renderedEdges: [...(canvasRef.current?.querySelectorAll('.react-flow__edge') ?? [])].map((edge) => edge.getAttribute('data-id')).sort(),
        nodesWithoutHandles: nodes.filter((node) => !getInternalNode(node.id)?.internals.handleBounds).map((node) => node.id).sort(),
      }
      const signature = JSON.stringify(trace)
      if (signature !== lastTrace.current) {
        console.debug('Topology reconciliation (development)', { previous: lastTrace.current ? JSON.parse(lastTrace.current) : null, current: trace })
        lastTrace.current = signature
      }
    }, 100)
    return () => clearTimeout(timer)
  }, [graph, nodes, edges, getEdges, getInternalNode])

  // Until the user takes over the camera, keep the whole map framed as nodes are discovered.
  const nodeCount = nodes.length
  useEffect(() => {
    if (ui.fitToken !== 0) return
    const t = setTimeout(() => fitView({ ...FIT, duration: 400 }), 150)
    return () => clearTimeout(t)
  }, [nodeCount, ui.fitToken, fitView])

  useEffect(() => {
    const t = setTimeout(() => fitView({ ...FIT, duration: 500 }), 120)
    return () => clearTimeout(t)
  }, [ui.fitToken, fitView, mode])

  const actions = useMemo(() => ({ toggle: ui.toggle }), [ui.toggle])

  return (
    <TwinActions.Provider value={actions}>
      <div className="flex h-full flex-col">
        <div className="relative z-10 shrink-0 p-2">
          <Toolbar
            layers={ui.layers}
            counts={counts}
            onToggleLayer={ui.toggleLayer}
            onExpandAll={ui.expandAll}
            onCollapseAll={ui.collapseAll}
            sourceFilter={ui.sourceFilter}
            onSourceFilter={ui.filterSource}
          />
        </div>
        <div ref={canvasRef} className="relative min-h-0 flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            nodeOrigin={[0.5, 0.5]}
            fitView
            fitViewOptions={FIT}
            minZoom={0.1}
            maxZoom={1.6}
            onlyRenderVisibleElements={nodes.length > 80}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            zoomOnDoubleClick={false}
            onNodeClick={(_, n) => !n.id.startsWith('cluster:') && ui.select(n.id === ui.selectedId ? null : n.id)}
            onPaneClick={() => ui.select(null)}
            proOptions={{ hideAttribution: true }}
          />
          <div className="pointer-events-none absolute inset-2 z-10 flex items-end justify-between gap-2">
            <Legend />
            {ui.selectedId && (
              <Inspector
                graph={graph}
                id={ui.selectedId}
                model={model}
                onSelect={ui.select}
                onClose={() => ui.select(null)}
              />
            )}
          </div>
        </div>
      </div>
    </TwinActions.Provider>
  )
}

const EMPTY_HEALTH: ReadonlyMap<string, Health> = new Map()

export function ServiceMap({
  graph,
  report,
  mode,
}: {
  graph: TwinGraph
  report: HealthReport
  mode: ViewModeId
}) {
  return (
    <ReactFlowProvider>
      <Canvas graph={graph} report={report} mode={mode} />
    </ReactFlowProvider>
  )
}
