import type { Node } from '@xyflow/react'

export function reconcileNodes(next: Node[], current: Node[]): Node[] {
  const measured = new Map(current.map((node) => [node.id, node.measured]))
  return next.map((node) => {
    const dimensions = measured.get(node.id)
    return dimensions ? { ...node, measured: dimensions } : node
  })
}
