import type { DiscoveryResult } from '@/domain/graph'
import type { Layer } from '@/types'

export type IntegrationId = 'proxmox' | 'docker' | 'coolify' | 'sgs' | 'wallboard' | 'labscreen'

export type DataSource = 'live' | 'simulated'

/**
 * Anything that can report entities and relations to the twin. The twin
 * merges results idempotently (see domain/graph.ts), so sources can poll,
 * stream partial batches, or report removals independently.
 */
export interface DiscoverySource {
  id: string
  discover(): Promise<DiscoveryResult>
}

/**
 * Contract every external integration must fulfil. Optional methods let
 * each adapter provide only what its upstream can supply.
 */
export interface Integration extends Partial<DiscoverySource> {
  /** Where the last answer came from; adapters fall back to simulation when the upstream is down. */
  readonly source?: DataSource
  id: IntegrationId
  name: string
  description: string
  /** Layer of the twin this integration populates. */
  feeds: Layer
  /** Resolves true when the upstream is reachable. */
  ping(): Promise<boolean>
}
