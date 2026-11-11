import { ChevronsDownUp, ChevronsUpDown } from 'lucide-react'
import { LAYERS, layerMeta } from '@/lib/status'
import type { Layer } from '@/types'
import type { SourceFilter } from '@/domain/sourceClassification'

interface Props {
  layers: ReadonlySet<Layer>
  counts: Record<Layer, { total: number; alerts: number }>
  onToggleLayer: (l: Layer) => void
  onExpandAll: () => void
  onCollapseAll: () => void
  sourceFilter: SourceFilter
  onSourceFilter: (filter: SourceFilter) => void
}

export function Toolbar({ layers, counts, onToggleLayer, onExpandAll, onCollapseAll, sourceFilter, onSourceFilter }: Props) {
  return (
    <div className="hud-panel flex flex-wrap items-center gap-1.5 rounded-lg p-1.5 text-[11px]">
      {LAYERS.map((l) => {
        const on = layers.has(l)
        const { color, label } = layerMeta[l]
        const { total, alerts } = counts[l]
        return (
          <button
            key={l}
            onClick={() => onToggleLayer(l)}
            aria-pressed={on}
            className="flex items-center gap-1.5 rounded border px-2 py-1 transition-opacity"
            style={{
              borderColor: `color-mix(in srgb, ${color} ${on ? 60 : 20}%, transparent)`,
              color: on ? color : 'var(--theme-connection)',
              opacity: on ? 1 : 0.6,
            }}
          >
            <span className="size-2 rounded-full" style={{ background: on ? color : 'var(--theme-connection)' }} />
            {label}
            <span className="tabular-nums text-slate-400">{total}</span>
            {alerts > 0 && <span className="rounded bg-danger/20 px-1 tabular-nums text-danger">{alerts}</span>}
          </button>
        )
      })}
      <span className="mx-1 hidden h-4 w-px bg-neon/20 sm:block" />
      <label className="flex items-center gap-1 text-slate-400">Origen
        <select aria-label="Filtrar por origen" value={sourceFilter} onChange={(event) => {
          const value = event.target.value
          if (value === 'all' || value === 'live' || value === 'simulated') onSourceFilter(value)
        }} className="rounded border border-neon/25 bg-panel px-2 py-1 text-slate-200">
          <option value="all">Todo</option><option value="live">Solo LIVE</option><option value="simulated">Solo SIMULATED</option>
        </select>
      </label>
      <button onClick={onExpandAll} className="flex items-center gap-1 rounded px-2 py-1 text-slate-300 hover:bg-neon/10">
        <ChevronsUpDown className="size-3.5" /> Expandir
      </button>
      <button onClick={onCollapseAll} className="flex items-center gap-1 rounded px-2 py-1 text-slate-300 hover:bg-neon/10">
        <ChevronsDownUp className="size-3.5" /> Colapsar ramas
      </button>
    </div>
  )
}

export function Legend() {
  return (
    <div className="hud-panel pointer-events-none hidden items-center gap-4 rounded-lg px-3 py-1.5 text-[10px] uppercase tracking-wider text-slate-400 md:flex">
      <span className="flex items-center gap-1.5">
        <span className="h-0.5 w-6 bg-neon/70" /> aloja (host)
      </span>
      <span className="flex items-center gap-1.5">
        <span className="w-6 border-t border-dashed border-magenta" /> depende de
      </span>
      <span className="flex items-center gap-1.5">
        <span className="w-6 border-t border-dashed border-danger" /> dependencia caída
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-0.5 w-6 bg-secondary" /> impactado
      </span>
    </div>
  )
}
