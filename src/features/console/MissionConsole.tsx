import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronDown, Terminal } from 'lucide-react'
import { Timeline } from '@/features/timeline/Timeline'
import { severityColor } from '@/lib/status'
import type { EventSeverity, OpsEvent } from '@/types'

const fmt = new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
const SEVERITIES: EventSeverity[] = ['info', 'success', 'warn', 'error']
const VISIBLE_LINES = 60
const COUNT_WINDOW_MS = 5 * 60_000

type View = 'console' | 'timeline'

export function MissionConsole({ events, operationsMode = false }: { events: OpsEvent[]; operationsMode?: boolean }) {
  const [open, setOpen] = useState(true)
  const [view, setView] = useState<View>('console')
  const [hidden, setHidden] = useState<Set<EventSeverity>>(new Set())
  const activeView: View = operationsMode ? 'console' : view
  const views: View[] = operationsMode ? ['console'] : ['console', 'timeline']

  const counts = useMemo(() => {
    const c: Record<EventSeverity, number> = { info: 0, success: 0, warn: 0, error: 0 }
    // Events are newest-first and the history spans a week: chips count the recent window only.
    const ref = events[0]?.timestamp ?? 0
    for (const e of events) {
      if (ref - e.timestamp > COUNT_WINDOW_MS) break
      c[e.severity]++
    }
    return c
  }, [events])

  const visible = useMemo(() => events.filter((e) => !hidden.has(e.severity)), [events, hidden])
  const lines = useMemo(() => visible.slice(0, VISIBLE_LINES), [visible])

  const toggle = (s: EventSeverity) =>
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(s)) next.delete(s)
      else next.add(s)
      return next
    })

  return (
    <section className="hud-panel flex min-h-0 flex-col overflow-hidden rounded-lg font-mono" aria-label="Mission console">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-neon/20 px-3 py-1.5 text-[11px] uppercase tracking-widest text-slate-400">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 text-slate-200 hover:text-neon"
          aria-expanded={open}
        >
          <Terminal className="size-4 text-neon" />
          Mission Console
          <ChevronDown className={`size-3.5 transition-transform ${open ? '' : '-rotate-90'}`} />
        </button>
        <span className="flex items-center gap-1 text-ok">
          <span className="size-1.5 animate-pulse rounded-full bg-ok" /> LIVE
        </span>
        <div className="flex gap-1" role="tablist" aria-label="Vista">
          {views.map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={activeView === v}
              onClick={() => {
                setView(v)
                setOpen(true)
              }}
              className={`rounded border px-2 py-0.5 text-[10px] ${activeView === v ? 'border-neon/60 bg-neon/10 text-neon' : 'border-neon/15 text-slate-400 hover:text-slate-200'}`}
            >
              {v === 'console' ? 'Console' : 'Timeline'}
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-1">
          {SEVERITIES.map((s) => (
            <button
              key={s}
              onClick={() => toggle(s)}
              aria-pressed={!hidden.has(s)}
              className="rounded border px-2 py-0.5 text-[10px] transition-opacity"
              style={{
                color: severityColor[s],
                borderColor: `${severityColor[s]}66`,
                opacity: hidden.has(s) ? 0.35 : 1,
              }}
            >
              {s} {counts[s]}
            </button>
          ))}
        </div>
      </header>

      <motion.div
        initial={false}
        animate={{ height: open ? (activeView === 'timeline' ? 210 : 124) : 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col overflow-hidden bg-black/40"
      >
        {activeView === 'timeline' ? (
          <Timeline events={visible} />
        ) : (
          <>
            <ul className="min-h-0 flex-1 overflow-y-auto px-3 py-1.5 text-[11px] leading-5" aria-live="off">
              {lines.map((e) => (
                <li key={e.id} className="flex gap-2 whitespace-nowrap">
                  <time className="shrink-0 tabular-nums text-slate-600">{fmt.format(e.timestamp)}</time>
                  <span className="w-12 shrink-0 font-bold" style={{ color: severityColor[e.severity] }}>
                    {e.severity === 'success' ? 'OK' : e.severity.toUpperCase()}
                  </span>
                  <span className="hidden w-28 shrink-0 truncate text-neon/80 sm:inline">{e.source}</span>
                  <span className="truncate text-slate-300">{e.message}</span>
                </li>
              ))}
            </ul>
            <div className="flex items-center gap-1 border-t border-neon/10 px-3 py-1 text-[11px] text-neon">
              <span>ops@centro:~$</span>
              <span className="text-slate-500">tail -f /var/log/mission.log</span>
              <span className="cursor-blink ml-0.5 inline-block h-3 w-1.5 bg-neon" />
            </div>
          </>
        )}
      </motion.div>
    </section>
  )
}
