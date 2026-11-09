/** Knowledge graph contracts are intentionally independent of operational integrations. */
export type KnowledgeEntityKind = 'concept' | 'document' | 'person' | 'system' | 'project' | 'tag'

export interface KnowledgeEntity {
  id: string
  kind: KnowledgeEntityKind
  label: string
  description?: string
  attributes?: Record<string, string | number | boolean>
}

export interface KnowledgeRelation {
  id: string
  from: string
  to: string
  kind: string
  label?: string
  weight?: number
}
