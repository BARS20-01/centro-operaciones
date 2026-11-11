import { useEffect, useRef, useState } from 'react'
import { affectedBy } from '@/domain/analysis'
import { mergeDiscovery, setStatus } from '@/domain/graph'
import { assess, categoryOfLayer, type HealthReport } from '@/domain/health'
import { topologyDiagnostics } from '@/domain/topologyDiagnostics'
import { createInitialSnapshot, eventTemplates, fillTemplate, securitySources, securityTemplates, seedHistory, servicesKpi } from '@/data/mock'
import { simulatedEventVisible, SOURCE_KEYS, simulationAllowed, type SourceObservations } from '@/features/diagnostics/sourceManager'
import type { OperationalEnvironment, OperationalSource } from '@/features/diagnostics/operationalStatus'
import { clamp, statusFromPercent } from '@/lib/status'
import type { OpsEvent, Snapshot, Status, TwinNode } from '@/types'

const MAX_EVENTS = 3000
const HISTORY_SAMPLES = 90
let counter = 0
const pick = <T,>(items: T[]): T => items[Math.floor(Math.random() * items.length)]
const event = (value: Omit<OpsEvent, 'id' | 'timestamp'>): OpsEvent => ({ ...value, id: `evt-${counter++}`, timestamp: Date.now() })

interface Base { snapshot: Snapshot; events: OpsEvent[]; history: number[] }
interface State extends Base { report: HealthReport }

function settle(base: Base, sample = false): State {
  const now = Date.now()
  let history = base.history
  if (sample) {
    const score = assess(base.snapshot.graph, base.snapshot.kpis, base.events, history, now).nexus.score
    history = [...history, score].slice(-HISTORY_SAMPLES)
  }
  return { ...base, history, report: assess(base.snapshot.graph, base.snapshot.kpis, base.events, history, now) }
}

function withEvents(state: State, events: OpsEvent[]): State {
  return settle({ ...state, events: [...events.reverse(), ...state.events].slice(0, MAX_EVENTS) })
}

function eligible(node: TwinNode): boolean {
  return node.source === 'simulated' && !node.sourceSystem
}

function nextStatus(status: Status): Status {
  const r = Math.random()
  if (status === 'ok') return r < 0.75 ? 'warn' : 'critical'
  if (status === 'warn') return r < 0.6 ? 'ok' : 'critical'
  if (status === 'critical') return r < 0.6 ? 'warn' : 'ok'
  return status
}

export function useMockOps(observations: SourceObservations, environment: OperationalEnvironment) {
  const processed = useRef<Record<OperationalSource, number>>({ Docker: 0, Coolify: 0, Proxmox: 0 })
  const lastTopologyDiagnostic = useRef('')
  const [state, setState] = useState<State>(() => {
    const snapshot = createInitialSnapshot()
    if (!simulationAllowed(environment)) {
      const nodes = Object.values(snapshot.graph.nodes).filter((node) => node.sourceSystem)
        .map((node) => ({ ...node, source: undefined, stale: true }))
      snapshot.graph = mergeDiscovery(snapshot.graph, { nodes }).graph
    }
    const events = seedHistory(snapshot.graph, Date.now()).filter(simulatedEventVisible)
    const first = assess(snapshot.graph, snapshot.kpis, events, [], Date.now()).nexus.score
    return settle({ snapshot, events, history: Array.from({ length: 10 }, () => first) })
  })

  useEffect(() => {
    if (!import.meta.env.DEV) return
    const diagnostics = topologyDiagnostics(state.snapshot.graph)
    const signature = JSON.stringify(diagnostics)
    if (signature === lastTopologyDiagnostic.current) return
    lastTopologyDiagnostic.current = signature
    console.groupCollapsed('Topology sources (development)')
    console.table(diagnostics.nodes)
    if (diagnostics.duplicateLabels.length) console.warn('Duplicate topology labels (not necessarily identical resources):', diagnostics.duplicateLabels)
    console.groupEnd()
  }, [state.snapshot.graph])

  useEffect(() => {
    const metrics = setInterval(() => setState((prev) => settle({
      ...prev,
      snapshot: { ...prev.snapshot, kpis: prev.snapshot.kpis.map((k) => {
        if (k.id === 'services') return k
        const next = clamp(k.percent + (Math.random() - 0.5) * 8, 5, 98)
        return { ...k, percent: next, value: next, status: statusFromPercent(next), history: [...k.history.slice(1), next] }
      }) },
    }, true)), 2000)
    const feed = setInterval(() => setState((prev) => {
      const nodes = Object.values(prev.snapshot.graph.nodes).filter(eligible)
      if (!nodes.length) return prev
      const node = pick(nodes)
      const template = pick(eventTemplates)
      return withEvents(prev, [event({ source: node.name, sourceSystem: node.sourceSystem, sourceMode: 'simulated',
        severity: template.severity, category: categoryOfLayer(node.layer), message: fillTemplate(template.message) })])
    }), 1800)
    const security = setInterval(() => {
      if (Math.random() >= 0.7) return
      const template = pick(securityTemplates)
      setState((prev) => withEvents(prev, [event({ source: pick(securitySources), sourceMode: 'simulated',
        severity: template.severity, category: 'security', message: fillTemplate(template.message) })]))
    }, 7000)
    const incidents = setInterval(() => setState((prev) => {
      const graph = prev.snapshot.graph
      const candidates = Object.values(graph.nodes).filter((node) =>
        node.status !== 'offline' && node.origin !== 'discovered' && eligible(node))
      if (!candidates.length) return prev
      const troubled = candidates.filter((node) => node.status !== 'ok')
      const target = pick(troubled.length && Math.random() < 0.55 ? troubled : candidates)
      const to = nextStatus(target.status)
      const next = setStatus(graph, target.id, to)
      const events = [event({ source: target.name, sourceSystem: target.sourceSystem, sourceMode: 'simulated',
        category: categoryOfLayer(target.layer), severity: to === 'ok' ? 'success' : to === 'warn' ? 'warn' : 'error',
        message: to === 'ok' ? 'servicio recuperado' : to === 'warn' ? 'degradación de rendimiento detectada' : 'fallo crítico · sin respuesta' })]
      if (to === 'critical') {
        const affected = affectedBy(next, target.id)
        if (affected.length) events.push(event({ source: target.name, sourceSystem: target.sourceSystem, sourceMode: 'simulated',
          severity: 'warn', category: categoryOfLayer(target.layer), message: `impacto en cascada: ${affected.slice(0, 4).map((id) => next.nodes[id].name).join(', ')}` }))
      }
      const kpis = prev.snapshot.kpis.map((k) => k.id === 'services' ? servicesKpi(next, k) : k)
      return withEvents({ ...prev, snapshot: { graph: next, kpis } }, events)
    }), 5000)
    return () => { clearInterval(metrics); clearInterval(feed); clearInterval(security); clearInterval(incidents) }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      const pending = (Object.keys(SOURCE_KEYS) as OperationalSource[]).filter((source) =>
        observations[source].revision && observations[source].revision !== processed.current[source])
      for (const source of pending) processed.current[source] = observations[source].revision
      setState((prev) => {
      let graph = prev.snapshot.graph
      const events: OpsEvent[] = []
      for (const source of pending) {
        const observation = observations[source]
        const system = SOURCE_KEYS[source]
        if (!observation.discovery) {
          const nodes = Object.values(graph.nodes).filter((node) => node.sourceSystem === system && !node.stale)
            .map((node) => ({ ...node, stale: true }))
          graph = mergeDiscovery(graph, { nodes }).graph
          continue
        }
        const discovery = observation.discovery
        const root = source === 'Docker' ? graph.nodes.docker : undefined
        const mode: NonNullable<TwinNode['source']> = observation.mode === 'simulated' ||
          (discovery.nodes ?? []).some((node) => node.source === 'simulated') ? 'simulated' : 'live'
        const rootUpdate = root ? [{ ...root, source: mode, sourceSystem: 'docker' as const,
          origin: 'discovered' as const, stale: false }] : []
        const report = mergeDiscovery(graph, { ...discovery, nodes: [...rootUpdate, ...(discovery.nodes ?? [])] })
        if (report.rejected.length) console.warn(`${source} graph discovery rejected entries:`, report.rejected)
        for (const node of report.added) {
          if (node.source !== 'live') continue
          events.push(event({ source, sourceSystem: system, sourceMode: node.source ?? 'unknown', severity: 'info',
            category: 'infrastructure', message: `Recurso detectado: ${node.name}` }))
        }
        for (const id of report.removed) {
          const removed = graph.nodes[id]
          if (!removed || removed.sourceSystem !== system || removed.source !== 'live' ||
            !(discovery.nodes ?? []).some((node) => node.source === 'live')) continue
          events.push(event({ source, sourceSystem: system, sourceMode: removed.source ?? 'unknown', severity: 'warn',
            category: 'infrastructure', message: `Recurso ya no visible: ${removed.name}` }))
        }
        for (const node of discovery.nodes ?? []) {
          const old = graph.nodes[node.id]
          if (source === 'Coolify' && node.category === 'Coolify application' && node.source === 'live' && old?.sourceSystem === 'coolify') {
            if (!old.deploymentStatus && node.deploymentStatus) events.push(event({
              source: node.name, sourceSystem: system, sourceMode: 'live', severity: 'info',
              category: 'applications', message: 'Deployment Started (detectado en ejecución)',
            }))
            else if (old.deploymentStatus !== node.deploymentStatus && node.deploymentStatus?.includes('fail')) events.push(event({
              source: node.name, sourceSystem: system, sourceMode: 'live', severity: 'error',
              category: 'applications', message: 'Deployment Failed (estado observado)',
            }))
          }
          if (node.source !== 'live' || !old || old.sourceSystem !== system || old.status === node.status) continue
          events.push(event({ source: node.name, sourceSystem: system, sourceMode: 'live',
            severity: node.status === 'ok' ? 'success' : 'warn', category: categoryOfLayer(node.layer),
            message: `Estado observado: ${old.status} → ${node.status}` }))
        }
        graph = report.graph
      }
      if (graph === prev.snapshot.graph && !events.length) return prev
      const kpis = prev.snapshot.kpis.map((k) => k.id === 'services' ? servicesKpi(graph, k) : k)
      return withEvents({ ...prev, snapshot: { graph, kpis } }, events)
      })
    }, 0)
    return () => clearTimeout(timer)
  }, [observations])

  const events = state.events.filter(simulatedEventVisible)
  return { ...state, events }
}
