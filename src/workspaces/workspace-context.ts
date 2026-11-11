import { createContext, useContext } from 'react'
import type { WorkspaceId } from './workspace'

export const WorkspaceContext = createContext<{
  workspace: WorkspaceId
  visited: readonly WorkspaceId[]
  setWorkspace: (workspace: WorkspaceId) => void
} | null>(null)

export function useWorkspace() {
  const context = useContext(WorkspaceContext)
  if (!context) throw new Error('useWorkspace must be used within WorkspaceProvider')
  return context
}
