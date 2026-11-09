export type ViewModeId = 'nexus' | 'obsidian' | 'homelab' | 'operations'
export type PlannedViewId = 'ai-operations' | 'security-operations' | 'infrastructure-operations'

export interface ViewMode {
  id: ViewModeId | PlannedViewId
  label: string
  description: string
  available: boolean
}

export const VIEW_MODES: ViewMode[] = [
  { id: 'nexus', label: 'NEXUS MODE', description: 'Digital Twin jerárquico', available: true },
  { id: 'obsidian', label: 'OBSIDIAN MODE', description: 'Knowledge Graph de relaciones', available: true },
  { id: 'homelab', label: 'HOMELAB MODE', description: 'Infraestructura física y lógica', available: true },
  { id: 'operations', label: 'OPERATIONS MODE', description: 'Salud, timeline e impactos', available: true },
  { id: 'ai-operations', label: 'AI OPERATIONS', description: 'Vista futura', available: false },
  { id: 'security-operations', label: 'SECURITY OPERATIONS', description: 'Vista futura', available: false },
  { id: 'infrastructure-operations', label: 'INFRASTRUCTURE OPERATIONS', description: 'Vista futura', available: false },
]

export const ACTIVE_VIEW_MODES = VIEW_MODES.filter(
  (mode): mode is ViewMode & { id: ViewModeId } => mode.available,
)
