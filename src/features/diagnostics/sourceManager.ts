import type { DiscoveryResult } from '../../domain/graph'
import type { OpsEvent, TwinGraph, TwinNode } from '../../types'
import { classifySource } from '../../domain/sourceClassification'
import type { OperationalEnvironment, OperationalReading, OperationalSource, OperationalStatus } from './operationalStatus'

export interface SourceObservation {
  reading: OperationalReading
  discovery: DiscoveryResult | null
  reason: string | null
  revision: number
  mode?: 'live' | 'simulated'
}

export type SourceObservations = Record<OperationalSource, SourceObservation>

export const SOURCE_KEYS: Record<OperationalSource, NonNullable<TwinNode['sourceSystem']>> = {
  Docker: 'docker',
  Coolify: 'coolify',
  Proxmox: 'proxmox',
}

export function simulationAllowed(environment: OperationalEnvironment): boolean {
  return environment === 'LOCAL' || environment === 'STAGING'
}

export function resolveDockerStatus(status: OperationalStatus, mode: 'live' | 'simulated' | undefined, diagnosticCount: number | null, inventoryCount: number | null): { status: OperationalStatus; reason: string | null } {
  if (mode === 'simulated' && (status === 'LIVE' || status === 'PARTIAL')) {
    return { status: 'PARTIAL', reason: 'Diagnostics respondió LIVE, pero el inventario operacional usa SIMULATED.' }
  }
  if (mode === 'live' && status !== 'LIVE') {
    return { status: 'PARTIAL', reason: 'El inventario Docker respondió LIVE, pero Diagnostics no confirmó todas las comprobaciones.' }
  }
  if (mode === 'live' && diagnosticCount !== null && diagnosticCount !== inventoryCount) {
    return { status: 'PARTIAL', reason: 'El conteo de Diagnostics no coincide con el inventario operacional.' }
  }
  if (mode === 'simulated') return { status: 'PARTIAL', reason: 'Docker LIVE no disponible; inventario SIMULATED de respaldo.' }
  if (!mode && status === 'LIVE') return { status: 'PARTIAL', reason: 'Diagnostics respondió, pero falló el inventario operacional.' }
  return { status, reason: null }
}

export function simulatedEventVisible(event: OpsEvent): boolean {
  return event.sourceMode !== 'simulated' || !event.sourceSystem
}

export function nodeSourceStatus(node: TwinNode, readings: Record<OperationalSource, OperationalReading>): OperationalStatus {
  const source = (Object.keys(SOURCE_KEYS) as OperationalSource[]).find((key) => SOURCE_KEYS[key] === node.sourceSystem)
  return source ? readings[source].status : classifySource(node)
}

export function consistencyCheck(observation: SourceObservation, graph: TwinGraph, source: OperationalSource): { reading: OperationalReading; reason: string | null } {
  const { reading, discovery } = observation
  if (!discovery && reading.status === 'LIVE') {
    return { reading: { ...reading, status: 'PARTIAL' }, reason: observation.reason ?? 'No hay inventario LIVE actual para comparar.' }
  }
  if (!discovery || (reading.status !== 'LIVE' && reading.status !== 'PARTIAL')) {
    return { reading, reason: observation.reason ?? (reading.status === 'SIMULATED'
      ? 'Se usan datos simulados; no se ha validado una lectura LIVE.'
      : 'No hay inventario LIVE actual para comparar.') }
  }
  if (reading.status === 'PARTIAL' && observation.reason && !(discovery.nodes ?? []).some((node) => node.source === 'live')) {
    return { reading, reason: observation.reason }
  }
  const expected = (discovery.nodes ?? []).filter((node) => node.source === 'live')
  const actual = Object.values(graph.nodes).filter((node) => node.sourceSystem === SOURCE_KEYS[source])
  const mixed = actual.some((node) => node.source === 'simulated')
  const missing = expected.some((node) => {
    const current = graph.nodes[node.id]
    return !current || current.source !== 'live' || current.stale ||
      Object.entries(node).some(([key, value]) => value !== undefined &&
        JSON.stringify(current[key as keyof TwinNode]) !== JSON.stringify(value))
  })
  const missingDependency = (discovery.dependencies ?? []).some((dependency) =>
    !graph.dependencies.some((item) => item.from === dependency.from && item.to === dependency.to))
  const expectedIds = new Set(expected.map((node) => node.id))
  const duplicate = expectedIds.size !== expected.length
  const extra = actual.some((node) => node.source === 'live' && !node.stale && !expectedIds.has(node.id) &&
    !(source === 'Docker' && node.id === 'docker'))
  if (mixed || missing || missingDependency || extra || duplicate) {
    return { reading: { ...reading, status: 'PARTIAL' }, reason: mixed
      ? 'El inventario operacional mezcla datos LIVE y SIMULATED.'
      : duplicate ? 'La lectura contiene identidades de nodo duplicadas.'
      : 'El inventario operacional no coincide con los recursos o relaciones de la lectura LIVE.' }
  }
  return { reading, reason: observation.reason }
}
