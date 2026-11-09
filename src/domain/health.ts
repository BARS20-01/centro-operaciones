import type { Criticality, EventCategory, Health, Kpi, Layer, OpsEvent, TwinGraph, TwinNode } from '@/types'
import { computeImpact, depIndex, isFailing, upstream } from './analysis'

/* ------------------------------------------------------------------ */
/* Criticality                                                         */
/* ------------------------------------------------------------------ */

export const CRITICALITY_WEIGHT: Record<Criticality, number> = { critical: 8, high: 4, medium: 2, low: 1 }

/** Used for nodes that no source has classified (e.g. freshly discovered containers). */
const LAYER_DEFAULT: Record<Layer, Criticality> = {
  infrastructure: 'high',
  services: 'medium',
  applications: 'medium',
  labs: 'low',
}

export const criticalityOf = (n: TwinNode): Criticality => n.criticality ?? LAYER_DEFAULT[n.layer]

/** Score penalty of a failing node, and the ceiling it puts on the global score. */
const FAILURE_PENALTY: Record<Criticality, number> = { critical: 60, high: 35, medium: 15, low: 5 }
const FAILURE_CAP: Record<Criticality, number> = { critical: 39, high: 59, medium: 79, low: 100 }

/* ------------------------------------------------------------------ */
/* Impact propagation                                                  */
/* ------------------------------------------------------------------ */

/** Contribution of each effective state to availability. Impacted nodes still run, but cannot be trusted. */
const STATE_SCORE: Record<Health, number> = { ok: 1, warn: 0.8, impacted: 0.5, offline: 0, critical: 0 }

export interface HealthModel {
  /** Effective health per node: reported status, or `impacted` when an upstream node is failing. */
  health: Map<string, Health>
  /** Impacted node -> the failing node that explains it. */
  causes: Map<string, string>
  counts: Record<Health, number>
  /** 0-100, criticality-weighted share of working nodes. */
  availability: number
  /** 0-100, integrity of depends_on relations and absence of impacted nodes. */
  dependencies: number
  /** 0-100, drops with every failing node according to its criticality. */
  criticalNodes: number
  /** Ceiling imposed on the global score by the most critical failing node. */
  cap: number
}

const modelCache = new WeakMap<TwinGraph, HealthModel>()

/** Pure and memoised per graph reference: status changes produce a new graph, metrics ticks do not. */
export function healthModelFor(graph: TwinGraph): HealthModel {
  const hit = modelCache.get(graph)
  if (hit) return hit
  const model = buildHealthModel(graph)
  modelCache.set(graph, model)
  return model
}

function buildHealthModel(graph: TwinGraph): HealthModel {
  const causes = computeImpact(graph)
  const health = new Map<string, Health>()
  const counts: Record<Health, number> = { ok: 0, warn: 0, impacted: 0, offline: 0, critical: 0 }

  let weight = 0
  let working = 0
  let impactedWeight = 0
  let penalty = 0
  let cap = 100

  for (const node of Object.values(graph.nodes)) {
    const crit = criticalityOf(node)
    const w = CRITICALITY_WEIGHT[crit]
    const h: Health = isFailing(node.status) ? node.status : causes.has(node.id) ? 'impacted' : node.status
    health.set(node.id, h)
    counts[h]++
    weight += w
    working += w * STATE_SCORE[h]
    if (h === 'impacted') impactedWeight += w
    if (isFailing(node.status)) {
      penalty += FAILURE_PENALTY[crit]
      cap = Math.min(cap, FAILURE_CAP[crit])
    }
  }

  let edgeScore = 0
  for (const d of graph.dependencies) {
    const target = health.get(d.to)
    edgeScore += target ? STATE_SCORE[target === 'warn' ? 'ok' : target] : 1
  }
  const edges = graph.dependencies.length ? (edgeScore / graph.dependencies.length) * 100 : 100
  const calm = weight ? (1 - impactedWeight / weight) * 100 : 100

  return {
    health,
    causes,
    counts,
    availability: weight ? (working / weight) * 100 : 100,
    dependencies: (edges + calm) / 2,
    criticalNodes: Math.max(0, 100 - penalty),
    cap,
  }
}

export interface RootCause {
  id: string
  /** Chain from the analysed node up to the failing node, both included. */
  path: string[]
}

/** Every failing node that explains why `id` is not healthy, found upstream through hosts and dependencies. */
export function rootCauses(graph: TwinGraph, id: string): RootCause[] {
  const idx = depIndex(graph)
  const via = new Map<string, string>()
  const seen = new Set([id])
  const queue = [id]
  const found: RootCause[] = []

  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i]
    for (const up of upstream(graph, idx, cur)) {
      if (seen.has(up) || !graph.nodes[up]) continue
      seen.add(up)
      via.set(up, cur)
      if (isFailing(graph.nodes[up].status)) {
        const path = [up]
        for (let p = via.get(up); p; p = via.get(p)) path.unshift(p)
        found.push({ id: up, path })
      } else {
        queue.push(up)
      }
    }
  }
  return found
}

/** How `from` relies on `to`: hosted by it, or declared dependency. */
export const relationBetween = (graph: TwinGraph, from: string, to: string): 'hosted' | 'depends' =>
  graph.nodes[from]?.parentId === to ? 'hosted' : 'depends'

/* ------------------------------------------------------------------ */
/* NEXUS HEALTH                                                        */
/* ------------------------------------------------------------------ */

export type HealthLevel = 'optimal' | 'healthy' | 'degraded' | 'at-risk' | 'critical'

export const HEALTH_LEVELS: Record<HealthLevel, { label: string; color: string; range: string }> = {
  optimal: { label: 'OPTIMAL', color: 'var(--theme-success)', range: '95-100' },
  healthy: { label: 'HEALTHY', color: 'var(--theme-primary)', range: '80-94' },
  degraded: { label: 'DEGRADED', color: 'var(--theme-warning)', range: '60-79' },
  'at-risk': { label: 'AT RISK', color: 'var(--theme-secondary)', range: '40-59' },
  critical: { label: 'CRITICAL', color: 'var(--theme-error)', range: '0-39' },
}

export function levelOf(score: number): HealthLevel {
  if (score >= 95) return 'optimal'
  if (score >= 80) return 'healthy'
  if (score >= 60) return 'degraded'
  if (score >= 40) return 'at-risk'
  return 'critical'
}

export interface Resources {
  cpu: number
  ram: number
  disk: number
}

export interface AlertLoad {
  warn: number
  error: number
}

export interface NexusHealth {
  score: number
  level: HealthLevel
  /** Every component is 0-100, higher is better. */
  components: { availability: number; dependencies: number; resources: number; alerts: number; criticalNodes: number }
}

const clamp = (n: number, min = 0, max = 100) => Math.min(max, Math.max(min, n))

export const resourcesFrom = (kpis: Kpi[]): Resources => {
  const pct = (id: Kpi['id']) => kpis.find((k) => k.id === id)?.percent ?? 0
  return { cpu: pct('cpu'), ram: pct('ram'), disk: pct('disk') }
}

/** Warn/error events inside the window; routine info/success events carry no weight. */
export function recentAlerts(events: readonly OpsEvent[], now: number, windowMs = 60_000): AlertLoad {
  const load: AlertLoad = { warn: 0, error: 0 }
  for (const e of events) {
    if (now - e.timestamp > windowMs) break // events are newest-first
    if (e.severity === 'warn') load.warn++
    else if (e.severity === 'error') load.error++
  }
  return load
}

export function computeNexusHealth(model: HealthModel, resources: Resources, alerts: AlertLoad): NexusHealth {
  // Resource pressure only starts to count above 70% utilisation.
  const pressure = (p: number) => clamp((p - 70) / 30, 0, 1)
  const resourceScore = 100 - ((pressure(resources.cpu) + pressure(resources.ram) + pressure(resources.disk)) / 3) * 100
  const alertScore = 100 - clamp(alerts.warn * 3 + alerts.error * 8)

  const components = {
    availability: model.availability,
    dependencies: model.dependencies,
    resources: resourceScore,
    alerts: alertScore,
    criticalNodes: model.criticalNodes,
  }
  const raw =
    components.availability * 0.4 +
    components.dependencies * 0.15 +
    components.resources * 0.2 +
    components.alerts * 0.1 +
    components.criticalNodes * 0.15
  const score = Math.round(Math.min(clamp(raw), model.cap))
  return { score, level: levelOf(score), components }
}

/* ------------------------------------------------------------------ */
/* Operational Score (Digital Twin score)                              */
/* ------------------------------------------------------------------ */

export type OperationalLabel = 'Excellent' | 'Good' | 'Warning' | 'Critical'

export const OPERATIONAL_LABELS: Record<OperationalLabel, string> = {
  Excellent: 'var(--theme-success)',
  Good: 'var(--theme-primary)',
  Warning: 'var(--theme-warning)',
  Critical: 'var(--theme-error)',
}

export interface OperationalScore {
  score: number
  label: OperationalLabel
  trend: 'up' | 'down' | 'flat'
  /** Points of NEXUS HEALTH gained/lost recently. */
  delta: number
  pillars: { health: number; dependencies: number; availability: number; trend: number }
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

/** Recent average against the window before it; needs a few samples before it says anything. */
export function trendOf(history: readonly number[]): { delta: number; trend: OperationalScore['trend'] } {
  if (history.length < 8) return { delta: 0, trend: 'flat' }
  const recent = mean(history.slice(-4))
  const before = mean(history.slice(-14, -4))
  const delta = Math.round((recent - before) * 10) / 10
  return { delta, trend: delta > 2 ? 'up' : delta < -2 ? 'down' : 'flat' }
}

export function computeOperationalScore(model: HealthModel, nexus: NexusHealth, history: readonly number[]): OperationalScore {
  const { delta, trend } = trendOf(history)
  // A recovering or steady system is not penalised; only decline lowers the score.
  const trendScore = delta >= 0 ? 100 : clamp(100 + delta * 4)
  const pillars = { health: nexus.score, dependencies: model.dependencies, availability: model.availability, trend: trendScore }
  const score = Math.round(
    clamp(pillars.health * 0.4 + pillars.dependencies * 0.2 + pillars.availability * 0.25 + pillars.trend * 0.15),
  )
  const label: OperationalLabel = score >= 90 ? 'Excellent' : score >= 75 ? 'Good' : score >= 50 ? 'Warning' : 'Critical'
  return { score, label, trend, delta, pillars }
}

/* ------------------------------------------------------------------ */
/* Full assessment                                                     */
/* ------------------------------------------------------------------ */

export interface HealthReport {
  model: HealthModel
  nexus: NexusHealth
  operational: OperationalScore
}

export function assess(
  graph: TwinGraph,
  kpis: Kpi[],
  events: readonly OpsEvent[],
  history: readonly number[],
  now: number,
): HealthReport {
  const model = healthModelFor(graph)
  const nexus = computeNexusHealth(model, resourcesFrom(kpis), recentAlerts(events, now))
  return { model, nexus, operational: computeOperationalScore(model, nexus, history) }
}

/* ------------------------------------------------------------------ */
/* Event categories                                                    */
/* ------------------------------------------------------------------ */

export const categoryOfLayer = (layer: Layer): EventCategory =>
  layer === 'applications' ? 'applications' : layer === 'labs' ? 'labs' : 'infrastructure'
