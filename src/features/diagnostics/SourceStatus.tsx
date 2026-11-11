import { SOURCE_COLORS, type OperationalSource } from './operationalStatus'
import { useOperationalStatus } from './operationalStatusContext'

const SOURCES: OperationalSource[] = ['Docker', 'Coolify', 'Proxmox']
const timeFormat = new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' })

export function SourceStatus() {
  const { readings: displayed, environment, reasons, observations } = useOperationalStatus()

  return (
    <section className="hud-panel shrink-0 rounded-lg border border-neon/20 px-3 py-2" aria-label="Estado de fuentes de infraestructura">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] uppercase tracking-wider">
        <h3 className="font-bold text-neon">Infrastructure Sources</h3>
        <span className="text-slate-400">Environment: <strong className="text-slate-200">{environment}</strong></span>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
        {SOURCES.map((source) => (
          <div key={source} className="flex flex-col text-[10px] text-slate-200">
            <span className="inline-flex items-center gap-1 whitespace-nowrap">
              <span aria-hidden="true" className="size-1.5 rounded-full" style={{ backgroundColor: SOURCE_COLORS[displayed[source].status] }} />
              {source} <strong style={{ color: SOURCE_COLORS[displayed[source].status] }}>{displayed[source].status}</strong>
              <span className="text-slate-400">{displayed[source].count ?? '—'} {source === 'Docker' ? 'contenedores' : source === 'Coolify' ? 'proyectos' : 'VMs'}{observations[source].mode === 'simulated' ? ' · SIMULATED' : ''}</span>
            </span>
            <span className="text-slate-400">Last LIVE Sync: {displayed[source].lastSync ? <time dateTime={displayed[source].lastSync}>{timeFormat.format(new Date(displayed[source].lastSync))}</time> : '—'}</span>
            {reasons[source] && <span className="max-w-72 text-amber">{reasons[source]}</span>}
          </div>
        ))}
      </div>
    </section>
  )
}
