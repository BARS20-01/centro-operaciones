import { Activity, RefreshCw } from 'lucide-react'
import { SourceStatus } from '@/features/diagnostics/SourceStatus'
import { useOperationalStatus } from '@/features/diagnostics/operationalStatusContext'
import type { OperationalSource } from '@/features/diagnostics/operationalStatus'

const SOURCES: OperationalSource[] = ['Docker', 'Coolify', 'Proxmox']
const timeFormat = new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'medium' })
const time = (value: string | null) => value && Number.isFinite(Date.parse(value)) ? timeFormat.format(new Date(value)) : '—'

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="hud-panel flex min-h-20 flex-col justify-center gap-2 rounded-lg px-4 py-3">
    <span className="text-[10px] uppercase tracking-[0.18em] text-slate-400">{label}</span>
    <span className="font-display text-sm font-bold text-slate-100">{value}</span>
  </div>
}

export default function SystemDiagnosticsPage() {
  const { readings, reasons, observations, environment, dockerDiagnostics, coolify, proxmox, refresh } = useOperationalStatus()
  const live = SOURCES.filter((source) => readings[source].status === 'LIVE')
  const simulated = SOURCES.filter((source) =>
    readings[source].status === 'SIMULATED' || observations[source].mode === 'simulated' ||
    (source === 'Proxmox' && proxmox?.source === 'simulated'))
  const missing = SOURCES.filter((source) => readings[source].status !== 'LIVE')
  const proxmoxLive = proxmox?.source === 'live'
  return (
    <div className="h-full overflow-y-auto p-3 sm:p-5">
      <section className="mx-auto flex max-w-5xl flex-col gap-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Activity aria-hidden="true" className="size-6 text-neon" />
            <div>
              <h2 className="font-display text-lg font-bold uppercase tracking-[0.18em] text-slate-100 glow-text">System Diagnostics</h2>
              <p className="text-xs text-slate-400">Operational Status Center · Source Manager · {environment}</p>
              <p className="text-xs text-slate-400">Origen API: {import.meta.env.DEV ? import.meta.env.VITE_API_ORIGIN : 'mismo origen del despliegue'}</p>
            </div>
          </div>
          <button type="button" onClick={refresh} className="inline-flex items-center gap-2 rounded border border-neon/30 px-3 py-2 text-xs text-neon hover:bg-neon/10">
            <RefreshCw aria-hidden="true" className="size-3.5" /> Volver a comprobar
          </button>
        </header>
        <p className="text-xs text-slate-400">Las fuentes y los inventarios se comparten entre Diagnostics y Operations. PARTIAL indica lecturas divergentes o incompletas; Last LIVE Sync conserva la última lectura real conocida. Los eventos y mapas simulados conservan su origen.</p>
        <SourceStatus />
        <section className="grid gap-3 sm:grid-cols-3" aria-label="Resumen del sistema">
          <Metric label="API Status" value={dockerDiagnostics ? 'OK' : 'UNKNOWN'} />
          <Metric label="Docker Version" value={dockerDiagnostics?.dockerVersion ?? '—'} />
          <Metric label="Containers Found" value={dockerDiagnostics?.containersFound?.toString() ?? '—'} />
          <Metric label="Last Discovery" value={time(dockerDiagnostics?.lastDiscovery ?? null)} />
        </section>
        <section className="hud-panel rounded-lg px-4 py-3" aria-label="Source classification">
          <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-neon">Source Classification</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric label="Live Sources" value={live.join(', ') || 'Ninguna confirmada'} />
            <Metric label="Simulated Sources" value={[...simulated, 'SGS', 'Wallboard', 'LabScreen'].join(', ')} />
            <Metric label="Missing Sources" value={[...missing, 'SGS', 'Wallboard', 'LabScreen'].join(', ')} />
          </div>
        </section>
        <section className="hud-panel rounded-lg px-4 py-3" aria-label="Data Source Consistency Check">
          <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-neon">Data Source Consistency Check</h3>
          {SOURCES.map((source) => <div key={source} className="flex flex-wrap gap-2 border-t border-neon/10 py-2 text-xs">
            <strong className="w-24 text-slate-200">{source}</strong>
            <strong className="w-24 text-neon">{readings[source].status}</strong>
            <span className="text-slate-400">{reasons[source] ?? (observations[source].revision ? 'Inventario operacional consistente con la lectura compartida.' : 'Esperando comprobación.')}</span>
          </div>)}
          <p className="mt-2 text-xs text-slate-400">El chequeo compara la lectura y los nodos aplicados; no certifica que los permisos o el inventario externo sean completos.</p>
        </section>
        <section className="hud-panel rounded-lg px-4 py-3" aria-label="Componentes del sistema">
          <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-neon">Componentes</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric label="Frontend" value="OK" />
            <Metric label="Backend" value={dockerDiagnostics ? 'OK' : 'UNKNOWN'} />
            <Metric label="Docker Proxy / Engine" value={dockerDiagnostics?.dockerVersion ? `OK · ${dockerDiagnostics.dockerVersion}` : 'NO CONFIRMADO'} />
            <Metric label="Discovery Engine" value={readings.Docker.status} />
          </div>
          <p className="mt-2 text-xs text-slate-400">Sin respuesta no se puede distinguir una caída del proxy de una del Engine.</p>
        </section>
        <section className="hud-panel rounded-lg px-4 py-3" aria-label="Coolify Diagnostics">
          <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-neon">Coolify Diagnostics</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric label="Coolify Source" value={readings.Coolify.status} />
            <Metric label="Projects Discovered" value={readings.Coolify.count?.toString() ?? '—'} />
            <Metric label="Applications Discovered" value={coolify?.resources.filter((r) => r.type === 'application').length.toString() ?? '—'} />
            <Metric label="Deployments Discovered (activos)" value={coolify?.deployments.length.toString() ?? '—'} />
            <Metric label="Discovery Timestamp" value={time(readings.Coolify.lastSync)} />
          </div>
        </section>
        <section className="hud-panel rounded-lg px-4 py-3" aria-label="Proxmox Diagnostics">
          <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-neon">Proxmox Diagnostics</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric label="Proxmox Source" value={readings.Proxmox.status} />
            <Metric label="Inventory Status" value={proxmoxLive ? proxmox.snapshotErrors || proxmox.backupErrors ? 'INCOMPLETO' : 'CONSULTADO' : '—'} />
            <Metric label="VM Count" value={readings.Proxmox.count?.toString() ?? '—'} />
            <Metric label="LXC Count" value={proxmoxLive ? String(proxmox.resources.filter((r) => r.type === 'lxc').length) : '—'} />
            <Metric label="Storage Count" value={proxmoxLive ? String(proxmox.resources.filter((r) => r.type === 'storage').length) : '—'} />
            <Metric label="Node Status" value={proxmoxLive ? `${proxmox.resources.filter((r) => r.type === 'node' && r.status === 'online').length} online / ${proxmox.resources.filter((r) => r.type === 'node').length}` : '—'} />
            <Metric label="Snapshots" value={proxmoxLive ? `${proxmox.snapshots.length}${proxmox.snapshotErrors ? ' · INCOMPLETO' : ''}` : '—'} />
            <Metric label="Backups (por nodo/storage)" value={proxmoxLive ? `${proxmox.backups.length}${proxmox.backupErrors ? ' · INCOMPLETO' : ''}` : '—'} />
            <Metric label="Last Sync" value={time(readings.Proxmox.lastSync)} />
            <Metric label="VPS-WEB VM 200" value={proxmoxLive ? (proxmox.resources.some((r) => r.type === 'qemu' && r.vmid === 200 && r.node === 'proxmox') && proxmox.resources.some((r) => r.type === 'node' && r.node === 'proxmox') ? 'ENCONTRADA' : 'NO VINCULADA') : '—'} />
            <Metric label="GLPI VM 100" value={proxmoxLive ? proxmox.resources.find((r) => r.type === 'qemu' && r.vmid === 100)?.status ?? 'NO VISIBLE' : '—'} />
          </div>
          <p className="mt-3 text-xs text-slate-400">Proxmox LIVE sigue en validación. Los inventarios muestran únicamente recursos autorizados; los backups compartidos pueden contarse por nodo.</p>
        </section>
      </section>
    </div>
  )
}
