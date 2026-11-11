import type { TwinNode } from '../types'

export type SourceClassification = 'LIVE' | 'SIMULATED' | 'OFFLINE' | 'UNKNOWN'
export type SourceFilter = 'all' | 'live' | 'simulated'

export function classifySource(node: Pick<TwinNode, 'source' | 'stale' | 'status'>): SourceClassification {
  if (node.source === 'simulated') return 'SIMULATED'
  if (node.source === 'live') return node.stale || node.status === 'offline' ? 'OFFLINE' : 'LIVE'
  return 'UNKNOWN'
}

export function matchesSource(node: Pick<TwinNode, 'source'>, filter: SourceFilter): boolean {
  return filter === 'all' || node.source === filter
}
