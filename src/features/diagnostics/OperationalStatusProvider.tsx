import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createDockerIntegration, httpTransport } from '@/integrations/docker.integration'
import { coolifyNodes, fetchCoolifySnapshot, type CoolifySnapshot } from '@/integrations/coolify.integration'
import { fetchProxmoxSnapshot, proxmoxNodes, type ProxmoxSnapshot } from '@/integrations/proxmox.integration'
import { useMockOps } from '@/hooks/useMockOps'
import { dockerStatus, fetchDockerDiagnostics, operationalEnvironment, proxmoxStatus, type DockerDiagnostics, type OperationalReading, type OperationalSource } from './operationalStatus'
import { consistencyCheck, resolveDockerStatus, simulationAllowed, type SourceObservation, type SourceObservations } from './sourceManager'
import { OperationalStatusContext } from './operationalStatusContext'
import type { DiscoveryResult, NodeInput } from '@/domain/graph'

const SOURCES: OperationalSource[] = ['Docker', 'Coolify', 'Proxmox']
const initialObservation = (): SourceObservation => ({
  reading: { status: 'UNKNOWN', count: null, lastSync: null }, discovery: null, reason: 'Esperando primera lectura.', revision: 0,
})
const INITIAL: SourceObservations = { Docker: initialObservation(), Coolify: initialObservation(), Proxmox: initialObservation() }

export function OperationalStatusProvider({ children }: { children: ReactNode }) {
  const [observations, setObservations] = useState(INITIAL)
  const [environment] = useState(() => operationalEnvironment(import.meta.env.VITE_NEXUS_ENVIRONMENT, import.meta.env.DEV))
  const [dockerDiagnostics, setDockerDiagnostics] = useState<DockerDiagnostics | null>(null)
  const [coolify, setCoolify] = useState<CoolifySnapshot | null>(null)
  const [proxmox, setProxmox] = useState<ProxmoxSnapshot | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const known = useRef(new Map<OperationalSource, Set<string>>())
  const [docker] = useState(() => createDockerIntegration({
    transport: httpTransport('/api/docker/containers', '/api/docker/stats'),
    allowFallback: simulationAllowed(environment),
  }))
  const refresh = useCallback(() => setRefreshKey((key) => key + 1), [])
  const operations = useMockOps(observations, environment)

  useEffect(() => {
    let disposed = false
    const controllers = new Map<OperationalSource, AbortController>()
    const timers = new Map<OperationalSource, ReturnType<typeof setTimeout>>()
    const withRemovals = (source: OperationalSource, nodes: NodeInput[]): DiscoveryResult => {
      const ids = new Set(nodes.map((node) => node.id))
      const removed = [...(known.current.get(source) ?? [])].filter((id) =>
        !ids.has(id) && !(source === 'Proxmox' && (id === 'vps-web' || id.startsWith('proxmox-node/'))))
      known.current.set(source, ids)
      return { nodes, removed }
    }
    const publish = (source: OperationalSource, reading: OperationalReading, discovery: DiscoveryResult | null, reason: string | null, mode?: 'live' | 'simulated') => {
      if (disposed) return
      setObservations((prev) => ({ ...prev, [source]: {
        reading: { ...reading, lastSync: reading.lastSync ?? prev[source].reading.lastSync },
        discovery, reason, mode, revision: prev[source].revision + 1,
      } }))
    }
    const poll = async (source: OperationalSource) => {
      const controller = new AbortController()
      controllers.set(source, controller)
      const timeout = setTimeout(() => controller.abort(), 45_000)
      try {
        if (source === 'Docker') {
          const [diagnostics, discovery] = await Promise.allSettled([fetchDockerDiagnostics(controller.signal), docker.discover(controller.signal)])
          if (disposed) return
          const data = diagnostics.status === 'fulfilled' ? diagnostics.value : null
          setDockerDiagnostics(data)
          if (diagnostics.status === 'rejected') console.warn('Docker diagnostics unavailable:', diagnostics.reason)
          if (discovery.status === 'rejected') console.warn('Docker discovery unavailable:', discovery.reason)
          const result = discovery.status === 'fulfilled' ? discovery.value : null
          const mode = result ? docker.source : undefined
          const status = data ? dockerStatus(data) : 'UNKNOWN'
          const resolved = resolveDockerStatus(status, mode, data?.containersFound ?? null, result?.nodes?.length ?? null)
          publish(source, { status: resolved.status, count: mode === 'simulated' ? result?.nodes?.length ?? 0 : data?.containersFound ?? null,
            lastSync: data?.lastDiscovery ?? null }, result, resolved.reason, mode)
        } else if (source === 'Coolify') {
          const data = await fetchCoolifySnapshot(controller.signal)
          if (disposed) return
          if (!Number.isFinite(Date.parse(data.checkedAt))) throw new Error('Invalid Coolify discovery timestamp')
          const nodes = coolifyNodes(data)
          if (!disposed) setCoolify(data)
          publish(source, { status: 'LIVE', count: new Set(data.projects.map((project) => project.id)).size, lastSync: data.checkedAt },
            withRemovals(source, nodes), null)
        } else {
          const data = await fetchProxmoxSnapshot(controller.signal)
          if (disposed) return
          if (!Number.isFinite(Date.parse(data.checkedAt))) throw new Error('Invalid Proxmox discovery timestamp')
          const nodes = proxmoxNodes(data)
          if (!disposed) setProxmox(data)
          const simulated = data.source === 'simulated'
          const status = simulated ? simulationAllowed(environment) ? 'PARTIAL' : 'UNKNOWN' : proxmoxStatus(data)
          publish(source, { status, count: simulated ? null : new Set(data.resources.filter((r) => r.type === 'qemu').map((r) => r.id)).size,
            lastSync: simulated ? null : data.checkedAt }, simulated ? null : withRemovals(source, nodes),
          simulated ? (simulationAllowed(environment) ? 'Proxmox configurado en modo SIMULATED.' : 'Simulación Proxmox no permitida en este entorno.') :
            status === 'PARTIAL' ? 'Inventario de snapshots o backups incompleto.' : null)
        }
      } catch (error) {
        if (!disposed) {
          console.warn(`${source} source manager unavailable:`, error)
          if (source === 'Coolify') setCoolify(null)
          if (source === 'Proxmox') setProxmox(null)
          const status = error instanceof Error && /^(Coolify discovery|Proxmox discovery) returned 503$/.test(error.message) ? 'OFFLINE' : 'UNKNOWN'
          publish(source, { status, count: null, lastSync: null }, null, 'No se pudo confirmar la lectura actual.')
        }
      } finally {
        clearTimeout(timeout)
        controllers.delete(source)
        if (!disposed) timers.set(source, setTimeout(() => void poll(source), source === 'Docker' ? 5000 : 30_000))
      }
    }
    SOURCES.forEach((source) => timers.set(source, setTimeout(() => void poll(source), 0)))
    return () => {
      disposed = true
      controllers.forEach((controller) => controller.abort())
      timers.forEach((timer) => clearTimeout(timer))
    }
  }, [docker, environment, refreshKey])

  const value = useMemo(() => {
    const checked = Object.fromEntries(SOURCES.map((source) => [source,
      consistencyCheck(observations[source], operations.snapshot.graph, source)])) as Record<OperationalSource, ReturnType<typeof consistencyCheck>>
    const readings = Object.fromEntries(SOURCES.map((source) => [source, checked[source].reading])) as Record<OperationalSource, OperationalReading>
    const reasons = Object.fromEntries(SOURCES.map((source) => [source, checked[source].reason])) as Record<OperationalSource, string | null>
    return { observations, readings, reasons, environment, dockerDiagnostics, coolify, proxmox, refresh, operations }
  }, [observations, operations, environment, dockerDiagnostics, coolify, proxmox, refresh])
  return <OperationalStatusContext.Provider value={value}>{children}</OperationalStatusContext.Provider>
}
