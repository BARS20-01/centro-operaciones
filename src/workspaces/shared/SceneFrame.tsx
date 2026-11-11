import { Component, useEffect, useState, type ReactNode } from 'react'
import { useReducedMotion } from 'framer-motion'
import { useWorkspace } from '../workspace-context'
import type { WorkspaceId } from '../workspace'

class SceneBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: Error) { console.error('Workspace visualization unavailable:', error) }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}

export function SceneFrame({ workspace: sceneWorkspace, label, fallback, children }: {
  workspace: WorkspaceId; label: string; fallback: ReactNode; children: ReactNode
}) {
  const { workspace } = useWorkspace()
  const reduced = useReducedMotion()
  const [visible, setVisible] = useState(() => document.visibilityState === 'visible')
  useEffect(() => {
    const change = () => setVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', change)
    return () => document.removeEventListener('visibilitychange', change)
  }, [])
  return (
    <div className="relative h-72 overflow-hidden sm:h-96" role="img" aria-label={label}>
      {reduced || !visible || workspace !== sceneWorkspace ? fallback : <SceneBoundary fallback={fallback}>{children}</SceneBoundary>}
    </div>
  )
}
