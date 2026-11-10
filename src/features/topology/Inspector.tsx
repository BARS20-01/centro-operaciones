import { useMemo, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { affectedBy, depIndex, hostPath } from '@/domain/analysis'
import { criticalityOf, relationBetween, rootCauses, type HealthModel } from '@/domain/health'
import { formatBytes, formatUptime } from '@/integrations/docker.integration'
import type { DataSource } from '@/integrations/types'
import { criticalityMeta, healthColor, healthLabel, layerMeta } from '@/lib/status'
import type { TwinGraph } from '@/types'

interface Props {
  graph: TwinGraph
  id: string
  model: HealthModel
  source: DataSource | 'checking' | 'unavailable'
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

export function Inspector({ graph, id, model, source, onSelect, onClose }: Props) {
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
  const dataSource = node.source ?? (node.origin === 'discovered' && source === 'live' ? 'live' : 'simulated')
  const entitiesAffected = blast

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
            {node.origin === 'discovered' && <span className="text-neon/70">auto</span>}
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
              <div
                key={c.id}
                className="rounded border px-2 py-1"
                style={{
                  borderColor: 'color-mix(in srgb, var(--theme-secondary) 40%, transparent)',
                  backgroundColor: 'color-mix(in srgb, var(--theme-secondary) 10%, transparent)',
                }}
              >
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
        <Row label={`Entidades afectadas (${entitiesAffected.length})`}>
          <span className="flex flex-wrap gap-1">
            {blast.slice(0, 12).map((n) => (
              <button
                key={n}
                onClick={() => onSelect(n)}
                className="rounded border px-1.5 py-0.5 text-slate-200 hover:bg-white/10"
                style={{
                  borderColor: `color-mix(in srgb, ${healthColor[model.health.get(n) ?? 'impacted']} 53%, transparent)`,
                }}
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
      {node.image && (
        <Row label="Imagen Docker">
          <span className="break-all text-slate-300">{node.image}</span>
        </Row>
      )}
      {node.ports && (
        <Row label="Puertos">
          <span className="text-slate-300">{node.ports.length ? node.ports.join(', ') : 'Sin puertos publicados'}</span>
        </Row>
      )}
      {node.networks && (
        <Row label="Redes">
          <span className="text-slate-300">{node.networks.length ? node.networks.join(', ') : 'Sin redes asignadas'}</span>
        </Row>
      )}
      {node.startedAt && (
        <Row label="Fecha de inicio">
          <time className="text-slate-300">{node.startedAt}</time>
        </Row>
      )}
      {node.sourceSystem === 'coolify' && ['Coolify application', 'Coolify service', 'Coolify database'].includes(node.category ?? '') && (
        <>
          <Row label="Application Name"><span className="text-slate-300">{node.name}</span></Row>
          <Row label="Project Name"><span className="text-slate-300">{node.projectName ?? 'No disponible'}</span></Row>
          <Row label="Environment"><span className="text-slate-300">{node.environmentName ?? 'No disponible'}</span></Row>
          <Row label="Current Status"><span className="text-slate-300">{node.currentStatus ?? 'No disponible'}</span></Row>
          <Row label="URL"><span className="break-all text-slate-300">{node.publicUrl ?? 'No disponible'}</span></Row>
          <Row label="Deployment Status"><span className="text-slate-300">{node.deploymentStatus ?? 'Sin despliegue activo conocido'}</span></Row>
          <Row label="Active Deployment"><span className="text-slate-300">{node.deploymentTime ?? 'No disponible'}</span></Row>
          <Row label="Docker Container"><span className="text-slate-300">Asociación no verificada</span></Row>
        </>
      )}
      <Row label="Descripción">
        <span className="text-slate-300">{node.description ?? 'Descripción no disponible.'}</span>
      </Row>
      <Row label="Categoría">
        <span className="text-slate-300">
          {node.category ?? layerMeta[node.layer].label}
        </span>
      </Row>
      <Row label="Criticidad">
        <span style={{ color: crit.color }}>{crit.label}</span>
      </Row>
      <Row label="Dependencias">
        <div className="space-y-1">
          <div>Depende de: {chips(uses)}</div>
          <div>Usado por: {chips(usedBy)}</div>
          <div>
            Ruta: <span className="text-slate-300">{path.map((p) => p.name).join(' › ')}</span>
          </div>
        </div>
      </Row>
      {!blast.length && <Row label={`Entidades afectadas (${entitiesAffected.length})`}>{chips(entitiesAffected)}</Row>}
      <Row label="Repositorio Git">
        {node.repositoryUrl ? (
          <a className="text-neon hover:underline" href={node.repositoryUrl} target="_blank" rel="noreferrer">
            {node.repositoryUrl}
          </a>
        ) : (
          <span className="text-slate-500">No vinculado</span>
        )}
      </Row>
      <Row label="Última actualización">
        <span className="text-slate-300">
          {node.updatedAt ? new Date(node.updatedAt).toLocaleString() : 'No disponible'}
        </span>
      </Row>
      <Row label="Estado operacional">
        <span className="font-semibold" style={{ color: healthColor[health] }}>
          {healthLabel[health]}
        </span>
      </Row>
      <Row label="Fuente">
        <span className="font-semibold" style={{ color: dataSource === 'live' ? 'var(--theme-success)' : 'var(--theme-warning)' }}>
          {node.sourceSystem ? `${node.sourceSystem.toUpperCase()} ` : ''}{dataSource === 'live' ? 'LIVE' : 'SIMULATED'}{node.stale ? ' · SINCRONIZACIÓN FALLIDA' : ''}
        </span>
      </Row>
      <Row label={`Aloja (${hosted.length})`}>{chips(hosted)}</Row>
    </aside>
  )
}
