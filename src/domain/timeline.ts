import type { EventCategory, EventSeverity, OpsEvent } from '@/types'

export type TimelineRange = '5m' | '1h' | '24h' | '7d'

export const TIMELINE_RANGES: { id: TimelineRange; label: string; title: string; ms: number }[] = [
  { id: '5m', label: '5 min', title: 'Últimos 5 minutos', ms: 5 * 60_000 },
  { id: '1h', label: '1 h', title: 'Última hora', ms: 60 * 60_000 },
  { id: '24h', label: '24 h', title: 'Últimas 24 horas', ms: 24 * 60 * 60_000 },
  { id: '7d', label: '7 d', title: 'Últimos 7 días', ms: 7 * 24 * 60 * 60_000 },
]

export const CATEGORIES: EventCategory[] = ['infrastructure', 'applications', 'labs', 'security']

export interface CategorySummary {
  total: number
  bySeverity: Record<EventSeverity, number>
  /** Event counts per time slice, oldest first. */
  buckets: number[]
  /** Newest first, capped so a 7-day window never floods the DOM. */
  latest: OpsEvent[]
}

export type TimelineSummary = Record<EventCategory, CategorySummary>

const emptySummary = (buckets: number): CategorySummary => ({
  total: 0,
  bySeverity: { info: 0, success: 0, warn: 0, error: 0 },
  buckets: Array.from({ length: buckets }, () => 0),
  latest: [],
})

/**
 * Single pass over newest-first events: filters the window, groups by
 * category and builds the per-category histogram.
 */
export function summarizeTimeline(
  events: readonly OpsEvent[],
  range: TimelineRange,
  now: number,
  buckets = 24,
  maxLatest = 40,
): TimelineSummary {
  const span = TIMELINE_RANGES.find((r) => r.id === range)!.ms
  const from = now - span
  const out = Object.fromEntries(CATEGORIES.map((c) => [c, emptySummary(buckets)])) as TimelineSummary

  for (const e of events) {
    if (e.timestamp < from) break
    const s = out[e.category]
    s.total++
    s.bySeverity[e.severity]++
    const slot = Math.min(buckets - 1, Math.max(0, Math.floor(((e.timestamp - from) / span) * buckets)))
    s.buckets[slot]++
    if (s.latest.length < maxLatest) s.latest.push(e)
  }
  return out
}
