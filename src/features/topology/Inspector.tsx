import { useMemo, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { affectedBy, depIndex, hostPath } from '@/domain/analysis'
import { criticalityOf, relationBetween, rootCauses, type HealthModel } from '@/domain/health'
import { formatBytes, formatUptime } from '@/integrations/docker.integration'
import { criticalityMeta, healthColor, healthLabel, layerMeta } from '@/lib/status'
import type { TwinGraph } from '@/types'

interface Props {
  graph: TwinGraph
  id: string
  model: HealthModel
  onSelect: (id: string) => void
  onClose: () => void
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-2">
      <div className="mb-0.5 text-[9px] uppercase tracking-widest text-slate-500">{label}</div>
      {children}
    </div>
  )
}

export function Inspector({ graph, id, model, onSelect, onClose }: Props) {
  const node = graph.nodes[id]
  const idx = useMemo(() => depIndex(graph), [graph])
  const causes = useMemo(() => (graph.nodes[id] ? rootCauses(graph, id) : []), [graph, id])
  const blast = useMemo(() => {
    const n = graph.nodes[id]
    return n && (n.status === 'critical' || n.status === 'offline') ? affectedBy(graph, id) : []
  }, [graph, id])
  if (!node) return null

  const path = hostPath(graph, id)
  const uses = idx.uses.get(id) ?? []
  const usedBy = idx.usedBy.get(id) ?? []
  const hosted = graph.children[id] ?? []
  const health = model.health.get(id) ?? node.status
  const crit = criticalityMeta[criticalityOf(node)]
  const failing = node.status === 'critical' || node.status === 'offline'
  const name = (n: string) => graph.nodes[n]?.name ?? n

  const chips = (ids: string[]) =>
    ids.length === 0 ? (
      <span className="text-slate-600">—</span>
    ) : (
      <span className="flex flex-wrap gap-1">
        {ids.slice(0, 12).map((n) => (
          <button
            key={n}
            onClick={() => onSelect(n)}
            className="rounded border border-neon/25 px-1.5 py-0.5 text-slate-200 hover:bg-neon/15"
          >
            {graph.nodes[n]?.name ?? n}
          </button>
        ))}
        {ids.length > 12 && <span className="text-slate-500">+{ids.length - 12}</span>}
      </span>
    )

  return (
    <aside className="hud-panel pointer-events-auto max-h-full w-64 overflow-y-auto rounded-lg p-3 text-[11px]" aria-label="Detalle del nodo">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-display text-sm font-bold text-slate-100">{node.name}</div>
          <div className="mt-0.5 flex items-center gap-2 text-[10px] uppercase tracking-wider">
            <span style={{ color: healthColor[health] }}>● {healthLabel[health]}</span>
            <span style={{ color: layerMeta[node.layer].color }}>{layerMeta[node.layer].label}</span>
            <span style={{ color: crit.color }}>{crit.label}</span>
            {node.origin === 'discovered' && <span className="text-cyan-300/70">auto</span>}
          </div>
        </div>
        <button onClick={onClose} aria-label="Cerrar" className="text-slate-400 hover:text-white">
          <X className="size-4" />
        </button>
      </div>

      <Row label="Root Cause Analysis">
        {causes.length > 0 ? (
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-wider" style={{ color: healthColor.impacted }}>
              Impactado por
            </div>
            {causes.map((c) => (
              <div key={c.id} className="rounded border border-[#fb923c]/40 bg-[#fb923c]/10 px-2 py-1">
                <button onClick={() => onSelect(c.id)} className="font-semibold text-danger hover:underline">
                  {name(c.id)} · {healthLabel[graph.nodes[c.id].status]}
                </button>
                <div className="mt-0.5 text-[10px] text-slate-400">
                  {c.path.slice(0, -1).map((p, i) => {
                    const next = c.path[i + 1]
                    return (
                      <span key={p}>
                        {i > 0 && ' · '}
                        {name(p)} {relationBetween(graph, p, next) === 'hosted' ? 'alojado en' : 'depende de'} {name(next)}
                      </span>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : failing ? (
          <div className="rounded border border-danger/40 bg-danger/10 px-2 py-1 text-danger">Origen del incidente</div>
        ) : (
          <span className="text-ok">Sin incidentes</span>
        )}
      </Row>
      {blast.length > 0 && (
        <Row label={`Impacto (${blast.length})`}>
          <span className="flex flex-wrap gap-1">
            {blast.slice(0, 12).map((n) => (
              <button
                key={n}
                onClick={() => onSelect(n)}
                className="rounded border px-1.5 py-0.5 text-slate-200 hover:bg-white/10"
                style={{ borderColor: `${healthColor[model.health.get(n) ?? 'impacted']}88` }}
              >
                {name(n)}
              </button>
            ))}
            {blast.length > 12 && <span className="text-slate-500">+{blast.length - 12}</span>}
          </span>
        </Row>
      )}

      {node.metrics && (
        <Row label="Runtime">
          <div className="grid grid-cols-3 gap-1 text-center">
            {[
              ['CPU', `${node.metrics.cpuPercent}%`],
              ['RAM', `${node.metrics.memPercent}%`],
              ['Uptime', formatUptime(node.metrics.uptimeSec)],
            ].map(([k, v]) => (
              <div key={k} className="rounded border border-neon/20 px-1 py-0.5">
                <div className="text-[8px] uppercase text-slate-500">{k}</div>
                <div className="tabular-nums text-slate-100">{v}</div>
              </div>
            ))}
          </div>
          <div className="mt-0.5 text-[9px] text-slate-500">{formatBytes(node.metrics.memBytes)} en uso</div>
        </Row>
      )}
      <Row label="Ruta de hosting">
        <span className="text-slate-300">{path.map((p) => p.name).join(' › ')}</span>
      </Row>
      <Row label="Depende de">{chips(uses)}</Row>
      <Row label="Usado por">{chips(usedBy)}</Row>
      <Row label={`Aloja (${hosted.length})`}>{chips(hosted)}</Row>
    </aside>
  )
}
