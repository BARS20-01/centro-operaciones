export const knowledgeLabels = ['Infrastructure', 'Applications', 'Laboratories', 'Incidents', 'Services', 'Users', 'Policies'] as const
export type KnowledgeEntity = typeof knowledgeLabels[number]
export const knowledgeEdges = [[0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6], [1, 5], [2, 4], [3, 6]] as const

export function relatedEntities(entity: KnowledgeEntity): KnowledgeEntity[] {
  const index = knowledgeLabels.indexOf(entity)
  return knowledgeEdges.flatMap(([a, b]) => a === index ? [knowledgeLabels[b]] : b === index ? [knowledgeLabels[a]] : [])
}
