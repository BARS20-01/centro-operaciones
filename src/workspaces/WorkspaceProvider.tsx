import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { WorkspaceContext } from './workspace-context'
import { isWorkspaceId, type WorkspaceId } from './workspace'

const STORAGE_KEY = 'nexus-prime-workspace'

function readWorkspace(): WorkspaceId {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return isWorkspaceId(stored) ? stored : 'operations'
  } catch (error) {
    console.error('Unable to read the saved workspace:', error)
    return 'operations'
  }
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspace, setWorkspaceId] = useState<WorkspaceId>(readWorkspace)
  const [visited, setVisited] = useState<WorkspaceId[]>(() => [workspace])
  const setWorkspace = useCallback((id: WorkspaceId) => {
    setVisited((current) => current.includes(id) ? current : [...current, id])
    setWorkspaceId(id)
  }, [])
  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, workspace) } catch (error) {
      console.error('Unable to persist the selected workspace:', error)
    }
  }, [workspace])
  const value = useMemo(() => ({ workspace, visited, setWorkspace }), [workspace, visited, setWorkspace])
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}
