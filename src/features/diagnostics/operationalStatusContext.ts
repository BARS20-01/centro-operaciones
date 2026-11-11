import { createContext, useContext } from 'react'
import type { OperationalEnvironment, OperationalReading, OperationalSource } from './operationalStatus'
import type { SourceObservations } from './sourceManager'
import type { CoolifySnapshot } from '../../integrations/coolify.integration'
import type { ProxmoxSnapshot } from '../../integrations/proxmox.integration'
import type { DockerDiagnostics } from './operationalStatus'
import type { Snapshot, OpsEvent } from '../../types'
import type { HealthReport } from '../../domain/health'

export interface OperationalStatusContextValue {
  readings: Record<OperationalSource, OperationalReading>
  environment: OperationalEnvironment
  observations: SourceObservations
  reasons: Record<OperationalSource, string | null>
  dockerDiagnostics: DockerDiagnostics | null
  coolify: CoolifySnapshot | null
  proxmox: ProxmoxSnapshot | null
  refresh: () => void
  operations: { snapshot: Snapshot; events: OpsEvent[]; history: number[]; report: HealthReport }
}

export const OperationalStatusContext = createContext<OperationalStatusContextValue | null>(null)

export function useOperationalStatus() {
  const context = useContext(OperationalStatusContext)
  if (!context) throw new Error('OperationalStatusContext provider is missing')
  return context
}
