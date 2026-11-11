export const WORKSPACES = [
  { id: 'operations', name: 'Operations Center' },
  { id: 'security', name: 'Security Command' },
  { id: 'digital-twin', name: 'Digital Twin' },
  { id: 'ai', name: 'AI Operations' },
  { id: 'homelab', name: 'Homelab Mission Control' },
  { id: 'executive', name: 'Executive Overview' },
] as const

export type WorkspaceId = typeof WORKSPACES[number]['id']
export const isWorkspaceId = (value: unknown): value is WorkspaceId =>
  WORKSPACES.some((workspace) => workspace.id === value)
