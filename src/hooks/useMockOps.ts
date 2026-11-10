// @refresh reset
// Reset hook state when this module changes during development.
import { useEffect, useState } from 'react'
import { affectedBy } from '@/domain/analysis'
import { mergeDiscovery, setStatus } from '@/domain/graph'
import { assess, categoryOfLayer, type HealthReport } from '@/domain/health'
import {
  createInitialSnapshot,
  eventTemplates,
  fillTemplate,
  securitySources,
  securityTemplates,
  seedHistory,
  servicesKpi,
} from '@/data/mock'
import { integrations } from '@/integrations/registry'
import type { DataSource } from '@/integrations/types'
import { clamp, statusFromPercent } from '@/lib/status'
import type { EventCategory, OpsEvent, Snapshot, Status, TwinNode } from '@/types'

/** Enough for the 7-day timeline; the oldest simulated events fall off first. */
const MAX_EVENTS = 3000
const HISTORY_SAMPLES = 90
const DISCOVERY_MS = 5000
let counter = 0

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]

const mkEvent = (e: Omit<OpsEvent, 'id' | 'timestamp'>): OpsEvent => ({
  ...e,
  id: `evt-${counter++}`,
  timestamp: Date.now(),
})

const categoryOf = (node: TwinNode): EventCategory => categoryOfLayer(node.layer)

const routineEvent = (nodes: TwinNode[]): OpsEvent => {
  const node = pick(nodes)
  const t = pick(eventTemplates)
  return mkEvent({ source: node.name, severity: t.severity, category: categoryOf(node), message: fillTemplate(t.message) })
}

const securityEvent = (): OpsEvent => {
  const t = pick(securityTemplates)
  return mkEvent({ source: pick(securitySources), severity: t.severity, category: 'security', message: fillTemplate(t.message) })
}

function nextStatus(s: Status): Status {
  const r = Math.random()
  if (s === 'ok') return r < 0.75 ? 'warn' : 'critical'
  if (s === 'warn') return r < 0.6 ? 'ok' : 'critical'
  if (s === 'critical') return r < 0.6 ? 'warn' : 'ok'
  return s
}

const transitionEvent = (node: TwinNode, from: Status, to: Status): OpsEvent => {
  const base = { source: node.name, category: categoryOf(node) }
  if (to === 'ok') return mkEvent({ ...base, severity: 'success', message: 'servicio recuperado' })
  if (to === 'warn')
    return mkEvent({
      ...base,
      severity: 'warn',
      message: from === 'ok' ? 'degradación de rendimiento detectada' : 'recuperación parcial',
    })
  return mkEvent({ ...base, severity: 'error', message: 'fallo crítico · sin respuesta' })
}

interface Base {
  snapshot: Snapshot
  /** Newest first: the timeline engine relies on this ordering. */
  events: OpsEvent[]
  /** NEXUS HEALTH samples, oldest first, used for the trend. */
  history: number[]
}

interface State extends Base {
  report: HealthReport
}

/** Re-derives the health report; `sample` also records a new point of the health history. */
function settle(base: Base, sample = false): State {
  const now = Date.now()
  const { snapshot, events } = base
  let history = base.history
  if (sample) {
    const score = assess(snapshot.graph, snapshot.kpis, events, history, now).nexus.score
    history = [...history, score].slice(-HISTORY_SAMPLES)
  }
  return { snapshot, events, history, report: assess(snapshot.graph, snapshot.kpis, events, history, now) }
}

const withEvents = (state: State, ...events: OpsEvent[]): State =>
  settle({ ...state, events: [...events.reverse(), ...state.events].slice(0, MAX_EVENTS) })

/**
 * Simulated telemetry + discovery source. Swap this hook's internals for
 * real integrations (see src/integrations) without touching the UI.
 */
export function useMockOps() {
  const [dockerSource, setDockerSource] = useState<DataSource | 'checking' | 'unavailable'>('checking')
  const [state, setState] = useState<State>(() => {
    const snapshot = createInitialSnapshot()
    const nodes = Object.values(snapshot.graph.nodes)
    const now = Date.now()
    const live = [routineEvent(nodes), routineEvent(nodes), routineEvent(nodes)]
    const events = [...live, ...seedHistory(snapshot.graph, now)]
    const first = assess(snapshot.graph, snapshot.kpis, events, [], now).nexus.score
    return settle({ snapshot, events, history: Array.from({ length: 10 }, () => first) })
  })

  useEffect(() => {
    const metrics = setInterval(() => {
      setState((prev) =>
        settle(
          {
            ...prev,
            snapshot: {
              ...prev.snapshot,
              kpis: prev.snapshot.kpis.map((k) => {
                if (k.id === 'services') return k
                const next = clamp(k.percent + (Math.random() - 0.5) * 8, 5, 98)
                return { ...k, percent: next, value: next, status: statusFromPercent(next), history: [...k.history.slice(1), next] }
              }),
            },
          },
          true,
        ),
      )
    }, 2000)

    const feed = setInterval(() => {
      setState((prev) => withEvents(prev, routineEvent(Object.values(prev.snapshot.graph.nodes).filter((node) => node.source !== 'live'))))
    }, 1800)

    const security = setInterval(() => {
      if (Math.random() < 0.7) setState((prev) => withEvents(prev, securityEvent()))
    }, 7000)

    const incidents = setInterval(() => {
      setState((prev) => {
        const { graph } = prev.snapshot
        const candidates = Object.values(graph.nodes).filter((n) => n.status !== 'offline' && n.origin !== 'discovered')
        // Troubled nodes are picked more often so incidents resolve instead of piling up.
        const troubled = candidates.filter((n) => n.status !== 'ok')
        const target = pick(troubled.length && Math.random() < 0.55 ? troubled : candidates)
        const to = nextStatus(target.status)
        const next = setStatus(graph, target.id, to)
        const events = [transitionEvent(target, target.status, to)]
        if (to === 'critical') {
          const affected = affectedBy(next, target.id)
          if (affected.length) {
            const names = affected.slice(0, 4).map((id) => next.nodes[id].name)
            const more = affected.length > 4 ? ` +${affected.length - 4}` : ''
            events.push(
              mkEvent({
                source: target.name,
                severity: 'warn',
                category: categoryOf(target),
                message: `impacto en cascada: ${names.join(', ')}${more}`,
              }),
            )
          }
        }
        const kpis = prev.snapshot.kpis.map((k) => (k.id === 'services' ? servicesKpi(next, k) : k))
        return withEvents({ ...prev, snapshot: { graph: next, kpis } }, ...events)
      })
    }, 5000)

    let disposed = false
    let discovery: ReturnType<typeof setTimeout>
    let coolifyTimer: ReturnType<typeof setTimeout>
    let coolifyFailed = false
    let proxmoxTimer: ReturnType<typeof setTimeout>
    let proxmoxFailed = false
    const poll = async () => {
      const source = integrations.docker
      if (!source.discover) return
      let result
      try {
        result = await source.discover()
      } catch (error) {
        console.error('Docker discovery failed:', error)
        if (!disposed) {
          setDockerSource('unavailable')
          discovery = setTimeout(poll, DISCOVERY_MS)
        }
        return
      }
      if (disposed) return
      setDockerSource(source.source ?? 'unavailable')
      setState((prev) => {
        const report = mergeDiscovery(prev.snapshot.graph, result)
        if (report.graph === prev.snapshot.graph) return prev
        const kpis = prev.snapshot.kpis.map((k) => (k.id === 'services' ? servicesKpi(report.graph, k) : k))
        const events = [
          ...report.added.map((n) =>
            mkEvent({
              source: 'Docker',
              severity: 'info',
              category: 'infrastructure',
              message: `contenedor detectado: ${n.name} (${source.source === 'live' ? 'live' : 'sim'})`,
            }),
          ),
          ...report.removed.map((id) =>
            mkEvent({
              source: 'Docker',
              severity: 'warn',
              category: 'infrastructure',
              message: `contenedor eliminado: ${prev.snapshot.graph.nodes[id]?.name ?? id}`,
            }),
          ),
        ]
        const next = { ...prev, snapshot: { graph: report.graph, kpis } }
        return events.length ? withEvents(next, ...events) : settle(next)
      })
      discovery = setTimeout(poll, DISCOVERY_MS)
    }
    void poll()

    const pollCoolify = async () => {
      try {
        const result = await integrations.coolify.discover!()
        if (disposed) return
        coolifyFailed = false
        setState((prev) => {
          const report = mergeDiscovery(prev.snapshot.graph, result)
          if (report.rejected.length) console.warn('Coolify graph discovery rejected entries:', report.rejected.length)
          if (report.graph === prev.snapshot.graph) return prev
          const events: OpsEvent[] = []
          for (const node of result.nodes ?? []) {
            const old = prev.snapshot.graph.nodes[node.id]
            if (!old || old.sourceSystem !== 'coolify' || node.category !== 'Coolify application') continue
            if (old.currentStatus?.startsWith('exited') && node.currentStatus?.startsWith('running')) {
              events.push(mkEvent({ source: node.name, severity: 'success', category: 'applications', message: 'Application Started (transición observada)' }))
            } else if (old.currentStatus?.startsWith('running') && node.currentStatus?.startsWith('exited')) {
              events.push(mkEvent({ source: node.name, severity: 'warn', category: 'applications', message: 'Application Stopped (transición observada)' }))
            }
            if (!old.deploymentStatus && node.deploymentStatus) {
              events.push(mkEvent({ source: node.name, severity: 'info', category: 'applications', message: 'Deployment Started (detectado en ejecución)' }))
            } else if (old.deploymentStatus !== node.deploymentStatus && node.deploymentStatus?.includes('fail')) {
              events.push(mkEvent({ source: node.name, severity: 'error', category: 'applications', message: 'Deployment Failed (estado observado)' }))
            }
          }
          const kpis = prev.snapshot.kpis.map((k) => k.id === 'services' ? servicesKpi(report.graph, k) : k)
          const next = { ...prev, snapshot: { graph: report.graph, kpis } }
          return events.length ? withEvents(next, ...events) : settle(next)
        })
      } catch {
        if (disposed) return
        if (!coolifyFailed) {
          coolifyFailed = true
          console.warn('Coolify discovery unavailable')
          setState((prev) => {
            const nodes = Object.values(prev.snapshot.graph.nodes)
              .filter((node) => node.sourceSystem === 'coolify')
              .map((node) => ({ ...node, stale: true, status: node.id === 'coolify' ? 'warn' as const : node.status }))
            const root = prev.snapshot.graph.nodes.coolify
            if (root && !nodes.some((node) => node.id === root.id)) {
              nodes.push({ ...root, origin: 'discovered', source: 'simulated', sourceSystem: 'coolify', stale: true, status: 'warn' })
            }
            const report = mergeDiscovery(prev.snapshot.graph, { nodes })
            return withEvents({ ...prev, snapshot: { ...prev.snapshot, graph: report.graph } },
              mkEvent({ source: 'Coolify', severity: 'warn', category: 'infrastructure', message: 'Error de sincronización Coolify' }))
          })
        }
      }
      if (!disposed) coolifyTimer = setTimeout(pollCoolify, 30_000)
    }
    void pollCoolify()

    const pollProxmox = async () => {
      try {
        const result = await integrations.proxmox.discover!()
        if (disposed) return
        const recovered = proxmoxFailed
        proxmoxFailed = false
        setState((prev) => {
          const ids = new Set((result.nodes ?? []).map((node) => node.id))
          const retained = Object.values(prev.snapshot.graph.nodes)
            .filter((node) => node.sourceSystem === 'proxmox' && !ids.has(node.id) && !(result.removed ?? []).includes(node.id))
            .map((node) => ({ ...node, stale: true, status: 'warn' as const }))
          const report = mergeDiscovery(prev.snapshot.graph, { ...result, nodes: [...(result.nodes ?? []), ...retained] })
          if (report.rejected.length) console.warn('Proxmox graph discovery rejected entries:', report.rejected.length)
          if (report.graph === prev.snapshot.graph) return prev
          const events: OpsEvent[] = []
          if (recovered) events.push(mkEvent({ source: 'Proxmox', severity: 'success', category: 'infrastructure', message: 'Sincronización Proxmox recuperada' }))
          for (const node of report.added) {
            events.push(mkEvent({ source: 'Proxmox', severity: 'info', category: 'infrastructure', message: `Recurso detectado: ${node.name}` }))
          }
          for (const id of report.removed) {
            events.push(mkEvent({ source: 'Proxmox', severity: 'warn', category: 'infrastructure', message: `Recurso ya no visible: ${prev.snapshot.graph.nodes[id]?.name ?? id}` }))
          }
          for (const node of result.nodes ?? []) {
            const old = prev.snapshot.graph.nodes[node.id]
            if (old?.sourceSystem === 'proxmox' && old.status !== node.status) {
              events.push(transitionEvent({ ...old, ...node }, old.status, node.status))
            }
          }
          const kpis = prev.snapshot.kpis.map((k) => k.id === 'services' ? servicesKpi(report.graph, k) : k)
          const next = { ...prev, snapshot: { graph: report.graph, kpis } }
          return events.length ? withEvents(next, ...events) : settle(next)
        })
      } catch {
        if (disposed) return
        if (!proxmoxFailed) {
          proxmoxFailed = true
          console.warn('Proxmox discovery unavailable')
          setState((prev) => {
            const nodes = Object.values(prev.snapshot.graph.nodes)
              .filter((node) => node.sourceSystem === 'proxmox')
              .map((node) => ({ ...node, stale: true, status: node.id === 'proxmox' ? 'warn' as const : node.status }))
            const report = mergeDiscovery(prev.snapshot.graph, { nodes })
            return withEvents({ ...prev, snapshot: { ...prev.snapshot, graph: report.graph } },
              mkEvent({ source: 'Proxmox', severity: 'warn', category: 'infrastructure', message: 'Error de sincronización Proxmox' }))
          })
        }
      }
      if (!disposed) proxmoxTimer = setTimeout(pollProxmox, 30_000)
    }
    void pollProxmox()

    return () => {
      disposed = true
      clearInterval(metrics)
      clearInterval(feed)
      clearInterval(security)
      clearInterval(incidents)
      clearTimeout(discovery)
      clearTimeout(coolifyTimer)
      clearTimeout(proxmoxTimer)
    }
  }, [])

  return { ...state, dockerSource }
}
