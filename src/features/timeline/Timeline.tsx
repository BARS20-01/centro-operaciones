import { useMemo, useState } from 'react'
import { CATEGORIES, summarizeTimeline, TIMELINE_RANGES, type CategorySummary, type TimelineRange } from '@/domain/timeline'
import { useNow } from '@/hooks/useNow'
import { categoryMeta, severityColor } from '@/lib/status'
import type { EventCategory, OpsEvent } from '@/types'

const fmtShort = new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit', hour12: false })
const fmtLong = new Intl.DateTimeFormat('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })

function Histogram({ buckets, color }: { buckets: number[]; color: string }) {
  const max = Math.max(1, ...buckets)
  return (
    <div className="flex h-5 items-end gap-px" aria-hidden>
      {buckets.map((n, i) => (
        <span
          key={i}
          className="flex-1 rounded-t-sm"
          style={{ height: `${Math.max(n ? 12 : 4, (n / max) * 100)}%`, background: color, opacity: n ? 0.85 : 0.18 }}
        />
      ))}
    </div>
  )
}

function Group({ category, summary, long }: { category: EventCategory; summary: CategorySummary; long: boolean }) {
  const { label, color } = categoryMeta[category]
  const fmt = long ? fmtLong : fmtShort
  const { warn, error } = summary.bySeverity

  return (
    <section className="flex min-h-0 flex-col gap-1 rounded border border-neon/10 bg-black/20 p-1.5" aria-label={label}>
      <header className="flex items-center justify-between gap-1 text-[10px] uppercase tracking-wider">
        <span className="flex items-center gap-1.5" style={{ color }}>
          <span className="size-1.5 rounded-full" style={{ background: color }} />
          {label}
        </span>
        <span className="flex items-center gap-1.5 tabular-nums">
          {warn > 0 && <span style={{ color: severityColor.warn }}>{warn}w</span>}
          {error > 0 && <span style={{ color: severityColor.error }}>{error}e</span>}
          <span className="text-slate-300">{summary.total}</span>
        </span>
      </header>
      <Histogram buckets={summary.buckets} color={color} />
      <ul className="min-h-0 flex-1 overflow-y-auto text-[10px] leading-4">
        {summary.latest.length === 0 && <li className="text-slate-600">sin eventos</li>}
        {summary.latest.map((e) => (
          <li key={e.id} className="flex gap-1.5 whitespace-nowrap">
            <time className="shrink-0 tabular-nums text-slate-600">{fmt.format(e.timestamp)}</time>
            <span className="shrink-0 font-bold" style={{ color: severityColor[e.severity] }}>
              ●
            </span>
            <span className="truncate text-slate-300">
              <span className="text-cyan-300/70">{e.source}</span> {e.message}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Operational timeline: events of the selected window, grouped by domain. */
export function Timeline({ events }: { events: OpsEvent[] }) {
  const [range, setRange] = useState<TimelineRange>('1h')
  const now = useNow(2000)
  const summary = useMemo(() => summarizeTimeline(events, range, now), [events, range, now])
  const meta = TIMELINE_RANGES.find((r) => r.id === range)!

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5 px-3 py-1.5">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider">
        <span className="mr-1 text-slate-500">{meta.title}</span>
        {TIMELINE_RANGES.map((r) => (
          <button
            key={r.id}
            onClick={() => setRange(r.id)}
            aria-pressed={range === r.id}
            aria-label={r.title}
            className={`rounded border px-2 py-0.5 ${range === r.id ? 'border-neon/60 bg-neon/10 text-neon' : 'border-neon/15 text-slate-400 hover:text-slate-200'}`}
          >
            {r.label}
          </button>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-1.5 lg:grid-cols-4">
        {CATEGORIES.map((c) => (
          <Group key={c} category={c} summary={summary[c]} long={range === '24h' || range === '7d'} />
        ))}
      </div>
    </div>
  )
}
