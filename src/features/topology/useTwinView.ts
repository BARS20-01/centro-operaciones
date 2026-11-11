import { useCallback, useState } from 'react'
import { LAYERS } from '@/lib/status'
import type { Layer, TwinGraph } from '@/types'
import { collapsibleBranches, defaultCollapsed } from './view'
import type { SourceFilter } from '@/domain/sourceClassification'

/** UI state of the service map: filters, collapsed branches and selection. */
export function useTwinView(graph: TwinGraph) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => defaultCollapsed(graph))
  const [layers, setLayers] = useState<Set<Layer>>(() => new Set(LAYERS))
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')
  /** Bumped on user-driven structural changes so the canvas refits; discovery never refits. */
  const [fitToken, setFitToken] = useState(0)
  const refit = () => setFitToken((t) => t + 1)

  const toggle = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })
    setFitToken((t) => t + 1)
  }, [])

  const toggleLayer = (layer: Layer) => {
    setLayers((prev) => {
      const next = new Set(prev)
      if (!next.delete(layer)) next.add(layer)
      return next
    })
    refit()
  }

  const expandAll = () => {
    setCollapsed(new Set())
    refit()
  }
  const collapseAll = () => {
    setCollapsed(collapsibleBranches(graph))
    refit()
  }

  const filterSource = (filter: SourceFilter) => { setSourceFilter(filter); setSelectedId(null); refit() }
  return { collapsed, layers, selectedId, sourceFilter, filterSource, fitToken, toggle, toggleLayer, expandAll, collapseAll, select: setSelectedId }
}
