import type { Criticality, EventCategory, EventSeverity, Health, Layer, Status } from '@/types'

export const statusColor: Record<Status, string> = {
  ok: '#34d399',
  warn: '#fbbf24',
  critical: '#fb7185',
  offline: '#64748b',
}

/** Effective health palette: impacted is orange so it never reads as warn (amber) or critical (red). */
export const healthColor: Record<Health, string> = { ...statusColor, impacted: '#fb923c' }

export const healthLabel: Record<Health, string> = {
  ok: 'OK',
  warn: 'WARN',
  impacted: 'IMPACTED',
  offline: 'OFFLINE',
  critical: 'CRITICAL',
}

export const criticalityMeta: Record<Criticality, { label: string; color: string; pips: number }> = {
  critical: { label: 'CRITICAL', color: '#fb7185', pips: 4 },
  high: { label: 'HIGH', color: '#fb923c', pips: 3 },
  medium: { label: 'MEDIUM', color: '#fbbf24', pips: 2 },
  low: { label: 'LOW', color: '#64748b', pips: 1 },
}

export const categoryMeta: Record<EventCategory, { label: string; color: string }> = {
  infrastructure: { label: 'Infraestructura', color: '#22d3ee' },
  applications: { label: 'Aplicaciones', color: '#f0abfc' },
  labs: { label: 'Laboratorios', color: '#60a5fa' },
  security: { label: 'Seguridad', color: '#facc15' },
}

export const severityColor: Record<EventSeverity, string> = {
  info: '#22d3ee',
  success: '#34d399',
  warn: '#fbbf24',
  error: '#fb7185',
}

export const LAYERS: Layer[] = ['infrastructure', 'services', 'applications', 'labs']

export const layerMeta: Record<Layer, { label: string; color: string }> = {
  infrastructure: { label: 'Infrastructure Layer', color: '#22d3ee' },
  services: { label: 'Servicios', color: '#a78bfa' },
  applications: { label: 'Application Matrix', color: '#f0abfc' },
  labs: { label: 'Laboratory Grid', color: '#60a5fa' },
}

export function statusFromPercent(p: number): Status {
  if (p >= 90) return 'critical'
  if (p >= 75) return 'warn'
  return 'ok'
}

const rank: Record<Status, number> = { ok: 0, offline: 1, warn: 2, critical: 3 }
export const worstStatus = (list: Iterable<Status>): Status => {
  let worst: Status = 'ok'
  for (const s of list) if (rank[s] > rank[worst]) worst = s
  return worst
}

/** Offline is an expected state, not an alarm: aggregates show it as degraded. */
export const aggregateStatus = (s: Status): Status => (s === 'offline' ? 'warn' : s)

export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))
