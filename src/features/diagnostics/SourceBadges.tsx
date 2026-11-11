import { useOperationalStatus } from './operationalStatusContext'
import { SOURCE_COLORS, type OperationalSource } from './operationalStatus'

export function SourceBadges() {
  const { readings } = useOperationalStatus()
  const sources: OperationalSource[] = ['Docker', 'Coolify', 'Proxmox']
  return <span className="inline-flex flex-wrap gap-2 text-[10px]" aria-label={`Estado actual: ${sources.map((source) => `${source} ${readings[source].status}`).join(', ')}`}>
    {sources.map((source) =>
      <span key={source} className="whitespace-nowrap text-slate-400">{source} <strong style={{ color: SOURCE_COLORS[readings[source].status] }}>{readings[source].status}</strong></span>)}
  </span>
}
