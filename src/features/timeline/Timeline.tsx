import { useMemo, useState } from 'react'
import { Clock3 } from 'lucide-react'
import { SourceBadges } from '@/features/diagnostics/SourceBadges'
import { CATEGORIES, summarizeTimeline, TIMELINE_RANGES, type CategorySummary, type TimelineRange } from '@/domain/timeline'
import { useNow } from '@/hooks/useNow'
import { categoryMeta, severityColor } from '@/lib/status'
import type { EventCategory, OpsEvent } from '@/types'

const fmt = new Intl.DateTimeFormat('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })

function Group({ category, summary }: { category: EventCategory; summary: CategorySummary }) {
  const { label, color } = categoryMeta[category]
  const max = Math.max(1, ...summary.buckets)
  return (
    <div className="min-w-0 rounded border border-neon/10 bg-black/20 px-2 py-1.5">
      <div className="flex justify-between gap-2 text-[10px] uppercase tracking-wider">
        <span className="truncate" style={{ color }}>{label}</span>
        <span className="tabular-nums text-slate-200">{summary.total}</span>
      </div>
      <div className="mt-1 flex h-3 items-end gap-px" aria-hidden="true">
        {summary.buckets.map((n, i) => (
          <span key={i} className="flex-1 rounded-t-sm" style={{ height: `${Math.max(n ? 12 : 4, (n / max) * 100)}%`, background: color, opacity: n ? 0.85 : 0.18 }} />
        ))}
      </div>
    </div>
  )
}

export function Timeline({ events }: { events: OpsEvent[] }) {
  const [range, setRange] = useState<TimelineRange>('1h')
  const now = useNow(2000)
  const summary = useMemo(() => summarizeTimeline(events, range, now), [events, range, now])
  const latest = useMemo(
    () => CATEGORIES.flatMap((category) => summary[category].latest).sort((a, b) => b.timestamp - a.timestamp || a.id.localeCompare(b.id)),
    [summary],
  )
  const total = CATEGORIES.reduce((count, category) => count + summary[category].total, 0)

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="mr-auto flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-100">
          <Clock3 className="size-4 text-neon" aria-hidden="true" /> Operational Timeline
        </h3>
        <div className="flex gap-1" aria-label="Rango temporal">
          {TIMELINE_RANGES.map((r) => (
            <button key={r.id} onClick={() => setRange(r.id)} aria-pressed={range === r.id} aria-label={r.title}
              className={`rounded border px-2 py-1 text-[10px] ${range === r.id ? 'border-neon/60 bg-neon/10 text-neon' : 'border-neon/15 text-slate-400 hover:text-slate-200'}`}>
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid shrink-0 grid-cols-2 gap-1.5 sm:grid-cols-4" aria-label="Eventos por categoría">
        {CATEGORIES.map((category) => <Group key={category} category={category} summary={summary[category]} />)}
      </div>
      <p className="text-[10px] text-slate-400">Eventos recientes: {latest.length} de {total} en el intervalo seleccionado (máximo 40 por categoría).</p>
      <SourceBadges />
      <div className="min-h-0 flex-1 overflow-auto rounded border border-neon/15 bg-slate-900/50">
        <table className="w-full min-w-[620px] text-left text-xs">
          <thead className="sticky top-0 z-10 bg-slate-900 text-[10px] uppercase tracking-wider text-slate-400">
            <tr>{['Hora', 'Fuente', 'Origen', 'Estado', 'Categoría', 'Evento'].map((heading) => <th key={heading} scope="col" className="px-3 py-2 font-semibold">{heading}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-neon/10">
            {latest.map((event) => (
              <tr key={event.id} className="align-top text-slate-300">
                <td className="whitespace-nowrap px-3 py-2 tabular-nums"><time dateTime={new Date(event.timestamp).toISOString()}>{fmt.format(event.timestamp)}</time></td>
                <td className="px-3 py-2 text-slate-100">{event.source}</td>
                <td className="px-3 py-2"><span className="rounded border border-neon/20 px-1.5 py-0.5 text-[10px]">{event.sourceMode.toUpperCase()}</span></td>
                <td className="px-3 py-2" style={{ color: severityColor[event.severity] }}>{event.severity.toUpperCase()}</td>
                <td className="px-3 py-2" style={{ color: categoryMeta[event.category].color }}>{categoryMeta[event.category].label}</td>
                <td className="px-3 py-2">{event.message}</td>
              </tr>
            ))}
            {latest.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-400">Sin eventos en este intervalo.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
