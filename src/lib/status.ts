import type { Criticality, EventCategory, EventSeverity, Health, Layer, Status } from '@/types'

export const statusColor: Record<Status, string> = {
  ok: 'var(--theme-success)',
  warn: 'var(--theme-warning)',
  critical: 'var(--theme-error)',
  offline: 'var(--theme-connection)',
}

/** Effective health palette: impacted is orange so it never reads as warn (amber) or critical (red). */
export const healthColor: Record<Health, string> = { ...statusColor, impacted: 'var(--theme-secondary)' }

export const healthLabel: Record<Health, string> = {
  ok: 'OK',
  warn: 'WARN',
  impacted: 'IMPACTED',
  offline: 'OFFLINE',
  critical: 'CRITICAL',
}

export const criticalityMeta: Record<Criticality, { label: string; color: string; pips: number }> = {
  critical: { label: 'CRITICAL', color: 'var(--theme-error)', pips: 4 },
  high: { label: 'HIGH', color: 'var(--theme-warning)', pips: 3 },
  medium: { label: 'MEDIUM', color: 'var(--theme-secondary)', pips: 2 },
  low: { label: 'LOW', color: 'var(--theme-connection)', pips: 1 },
}

export const categoryMeta: Record<EventCategory, { label: string; color: string }> = {
  infrastructure: { label: 'Infraestructura', color: 'var(--theme-primary)' },
  applications: { label: 'Aplicaciones', color: 'var(--theme-secondary)' },
  labs: { label: 'Laboratorios', color: 'var(--theme-success)' },
  security: { label: 'Seguridad', color: 'var(--theme-warning)' },
}

export const severityColor: Record<EventSeverity, string> = {
  info: 'var(--theme-primary)',
  success: 'var(--theme-success)',
  warn: 'var(--theme-warning)',
  error: 'var(--theme-error)',
}

export const LAYERS: Layer[] = ['infrastructure', 'services', 'applications', 'labs']

export const layerMeta: Record<Layer, { label: string; color: string }> = {
  infrastructure: { label: 'Infrastructure Layer', color: 'var(--theme-primary)' },
  services: { label: 'Servicios', color: 'var(--theme-secondary)' },
  applications: { label: 'Application Matrix', color: 'var(--theme-secondary)' },
  labs: { label: 'Laboratory Grid', color: 'var(--theme-success)' },
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
