import { useEffect, useState } from 'react'
import { Activity, CheckCircle2, RefreshCw, TriangleAlert, XCircle } from 'lucide-react'
import { createInitialSnapshot } from '@/data/mock'
import { mergeDiscovery } from '@/domain/graph'
import { dockerIntegration } from '@/integrations/docker.integration'

type CheckStatus = 'OK' | 'WARN' | 'ERROR'

interface ApiDiagnostics {
  checkedAt: string
  dockerVersion: string | null
  containersFound: number | null
  lastDiscovery: string | null
  discoveryStatus: CheckStatus
}

interface SystemCheck {
  name: string
  status: CheckStatus
  detail: string
}

interface SystemSnapshot {
  apiStatus: CheckStatus
  dockerVersion: string | null
  containersFound: number | null
  lastDiscovery: string | null
  checks: SystemCheck[]
}

function isApiDiagnostics(value: unknown): value is ApiDiagnostics {
  return typeof value === 'object' && value !== null && !Array.isArray(value) &&
    'checkedAt' in value && typeof value.checkedAt === 'string' &&
    'dockerVersion' in value && (value.dockerVersion === null || typeof value.dockerVersion === 'string') &&
    'containersFound' in value && (value.containersFound === null || (typeof value.containersFound === 'number' && Number.isFinite(value.containersFound) && value.containersFound >= 0)) &&
    'lastDiscovery' in value && (value.lastDiscovery === null || typeof value.lastDiscovery === 'string') &&
    'discoveryStatus' in value && (value.discoveryStatus === 'OK' || value.discoveryStatus === 'ERROR')
}

async function fetchApiDiagnostics(signal: AbortSignal): Promise<ApiDiagnostics> {
  const response = await fetch('/api/diagnostics', { signal, headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`Diagnostics API returned ${response.status}`)
  const value: unknown = await response.json()
  if (!isApiDiagnostics(value)) throw new Error('Invalid diagnostics response')
  return value
}

function statusColor(status: CheckStatus) {
  if (status === 'OK') return 'var(--theme-success)'
  if (status === 'WARN') return 'var(--theme-warning)'
  return 'var(--theme-error)'
}

function StatusIndicator({ status }: { status: CheckStatus }) {
  const Icon = status === 'OK' ? CheckCircle2 : status === 'WARN' ? TriangleAlert : XCircle
  return (
    <span className="inline-flex items-center gap-1.5 font-bold tracking-wider" style={{ color: statusColor(status) }}>
      <Icon aria-hidden="true" className="size-4" />
      {status}
    </span>
  )
}

function formatTime(value: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return '—'
  return new Intl.DateTimeFormat('es', {
    dateStyle: 'medium',
    timeStyle: 'medium',
    hour12: false,
  }).format(new Date(value))
}

export default function SystemDiagnosticsPage() {
  const [snapshot, setSnapshot] = useState<SystemSnapshot | null>(null)
  const [checking, setChecking] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let disposed = false
    let timer: ReturnType<typeof setTimeout>
    let activeController: AbortController | undefined

    const check = async () => {
      setChecking(true)
      const controller = new AbortController()
      activeController = controller
      const timeout = setTimeout(() => controller.abort(), 45_000)
      const [apiResult, discoveryResult] = await Promise.allSettled([
        fetchApiDiagnostics(controller.signal),
        dockerIntegration.discover!(),
      ])
      clearTimeout(timeout)
      if (disposed) return

      const api = apiResult.status === 'fulfilled' ? apiResult.value : null
      if (apiResult.status === 'rejected') console.error('System diagnostics API unavailable:', apiResult.reason)
      if (discoveryResult.status === 'rejected') console.error('System diagnostics discovery failed:', discoveryResult.reason)

      const source = dockerIntegration.source ?? 'simulated'
      const discovery = discoveryResult.status === 'fulfilled' ? discoveryResult.value : null
      const merged = discovery ? mergeDiscovery(createInitialSnapshot().graph, discovery) : null
      const discoveryStatus: CheckStatus = !discovery
        ? 'ERROR'
        : source !== 'live'
          ? 'WARN'
          : merged && merged.rejected.length > 0
            ? 'WARN'
            : api?.discoveryStatus === 'ERROR'
              ? 'WARN'
              : 'OK'
      const engineReachable = source === 'live' || (api !== null && api.dockerVersion !== null)
      const proxyStatus: CheckStatus = engineReachable ? 'OK' : 'WARN'
      const engineStatus: CheckStatus = engineReachable ? 'OK' : 'ERROR'
      const apiStatus: CheckStatus = api ? 'OK' : 'ERROR'

      setSnapshot({
        apiStatus,
        dockerVersion: api?.dockerVersion ?? null,
        containersFound: source === 'live' ? api?.containersFound ?? null : null,
        lastDiscovery: api?.lastDiscovery ?? null,
        checks: [
          { name: 'Frontend', status: 'OK', detail: 'Interfaz de diagnóstico cargada en el navegador.' },
          {
            name: 'Backend',
            status: apiStatus,
            detail: api ? 'Express respondió al endpoint de diagnóstico.' : 'La API no respondió; revisa el servicio y el proxy Nginx.',
          },
          {
            name: 'Docker Proxy',
            status: proxyStatus,
            detail: engineReachable
              ? 'La ruta Docker configurada respondió a través del proxy.'
              : 'No se pudo confirmar la ruta; proxy y Engine no se distinguen desde el cliente.',
          },
          {
            name: 'Docker Engine',
            status: engineStatus,
            detail: api?.dockerVersion
              ? `Engine accesible; versión ${api.dockerVersion}.`
              : source === 'live'
                ? 'Engine accesible mediante el descubrimiento; versión no disponible.'
                : 'No se pudo obtener respuesta verificable del Engine.',
          },
          {
            name: 'Discovery Engine',
            status: discoveryStatus,
            detail: !discovery
              ? 'El proceso de descubrimiento falló.'
              : source !== 'live'
                ? 'La integración está usando datos simulados; no cuenta como Docker LIVE.'
                : merged && merged.rejected.length > 0
                  ? `Descubrimiento LIVE con ${merged.rejected.length} relación(es) o nodo(s) rechazado(s).`
                  : `Descubrimiento LIVE validado${api?.discoveryStatus === 'ERROR' ? '; el conteo del API no quedó confirmado.' : '.'}`,
          },
        ],
      })
      setChecking(false)
      timer = setTimeout(() => void check(), 15_000)
    }

    void check()
    return () => {
      disposed = true
      activeController?.abort()
      clearTimeout(timer)
    }
  }, [refreshKey])

  return (
    <div className="h-full overflow-y-auto p-3 sm:p-5">
      <section className="mx-auto flex max-w-5xl flex-col gap-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Activity aria-hidden="true" className="size-6 text-neon" />
            <div>
              <h2 className="font-display text-lg font-bold uppercase tracking-[0.18em] text-slate-100 glow-text">
                System Diagnostics
              </h2>
              <p className="text-xs text-slate-400">Estado de la ruta de despliegue y de la integración Docker LIVE.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setRefreshKey((key) => key + 1)}
            disabled={checking}
            className="inline-flex items-center gap-2 rounded border border-neon/30 px-3 py-2 text-xs text-neon hover:bg-neon/10 disabled:cursor-wait disabled:opacity-50"
          >
            <RefreshCw aria-hidden="true" className={`size-3.5 ${checking ? 'animate-spin' : ''}`} />
            {checking ? 'Comprobando' : 'Volver a comprobar'}
          </button>
        </header>

        <section className="grid gap-3 sm:grid-cols-3" aria-label="Resumen del sistema">
          <Metric label="API Status" value={snapshot?.apiStatus ?? 'CHECKING'} status={snapshot?.apiStatus} />
          <Metric label="Docker Version" value={snapshot?.dockerVersion ?? '—'} />
          <Metric
            label="Containers Found"
            value={snapshot?.containersFound === null || snapshot?.containersFound === undefined
              ? '—'
              : String(snapshot.containersFound)}
          />
        </section>

        <section className="hud-panel overflow-hidden rounded-lg" aria-label="Componentes del sistema">
          <header className="border-b border-neon/20 px-4 py-3">
            <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-neon">Componentes</h3>
          </header>
          <div className="divide-y divide-neon/10">
            {(snapshot?.checks ?? [
              { name: 'Frontend', status: 'OK' as const, detail: 'Interfaz de diagnóstico cargada en el navegador.' },
              { name: 'Backend', status: 'WARN' as const, detail: 'Esperando respuesta de Express.' },
              { name: 'Docker Proxy', status: 'WARN' as const, detail: 'Esperando verificación de la ruta Docker.' },
              { name: 'Docker Engine', status: 'WARN' as const, detail: 'Esperando verificación del Engine.' },
              { name: 'Discovery Engine', status: 'WARN' as const, detail: 'Esperando resultado de descubrimiento.' },
            ]).map((check) => (
              <div key={check.name} className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(10rem,1fr)_8rem_2fr] sm:items-center">
                <span className="text-sm font-bold text-slate-200">{check.name}</span>
                <StatusIndicator status={check.status} />
                <span className="text-xs leading-relaxed text-slate-400">{check.detail}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="hud-panel flex flex-wrap gap-x-8 gap-y-2 rounded-lg px-4 py-3 text-xs" aria-label="Último descubrimiento">
          <span className="text-slate-400">
            Last Discovery: <time className="text-slate-200">{formatTime(snapshot?.lastDiscovery ?? null)}</time>
          </span>
          <span className="text-slate-400">
            Fuente Docker: <strong className={dockerIntegration.source === 'live' ? 'text-ok' : 'text-amber'}>
              {dockerIntegration.source === 'live' ? 'LIVE' : 'SIMULATED / CHECKING'}
            </strong>
          </span>
        </section>

        <p className="text-[11px] leading-relaxed text-slate-500">
          Docker Proxy se marca OK cuando la API confirma una respuesta del Engine por la ruta configurada.
          Si no hay respuesta, esta vista no puede diferenciar por sí sola una caída del proxy de una caída del Engine.
          Los demás indicadores operacionales y los datos simulados del dashboard no sustituyen esta comprobación.
        </p>
      </section>
    </div>
  )
}

function Metric({ label, value, status }: { label: string; value: string; status?: CheckStatus }) {
  return (
    <div className="hud-panel flex min-h-20 flex-col justify-center gap-2 rounded-lg px-4 py-3">
      <span className="text-[10px] uppercase tracking-[0.18em] text-slate-400">{label}</span>
      <span className="truncate font-display text-base font-bold text-slate-100">
        {status ? <StatusIndicator status={status} /> : value}
      </span>
    </div>
  )
}
