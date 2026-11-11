export interface LayoutNode { id: string; x: number; y: number }
export type LayoutEdge = readonly [string, string]

export function forceLayout(nodes: readonly LayoutNode[], edges: readonly LayoutEdge[]): LayoutNode[] {
  const result = nodes.map((node) => ({ ...node }))
  const byId = new Map(result.map((node) => [node.id, node]))
  for (let iteration = 0; iteration < 180; iteration++) {
    const forces = result.map(() => ({ x: 0, y: 0 }))
    const cooling = 1 - iteration / 200
    for (let i = 0; i < result.length; i++) {
      for (let j = i + 1; j < result.length; j++) {
        let dx = result[i].x - result[j].x
        const dy = result[i].y - result[j].y
        if (dx === 0 && dy === 0) dx = 0.01
        const distance = Math.max(1, Math.hypot(dx, dy))
        const force = Math.min(12, 5500 / (distance * distance))
        forces[i].x += dx / distance * force
        forces[i].y += dy / distance * force
        forces[j].x -= dx / distance * force
        forces[j].y -= dy / distance * force
      }
    }
    for (const [from, to] of edges) {
      const a = byId.get(from)
      const b = byId.get(to)
      if (!a || !b) throw new Error(`Unknown topology edge: ${from} -> ${to}`)
      const dx = b.x - a.x
      const dy = b.y - a.y
      const distance = Math.max(1, Math.hypot(dx, dy))
      const force = (distance - 165) * 0.012
      const ai = result.indexOf(a)
      const bi = result.indexOf(b)
      forces[ai].x += dx / distance * force
      forces[ai].y += dy / distance * force
      forces[bi].x -= dx / distance * force
      forces[bi].y -= dy / distance * force
    }
    result.forEach((node, i) => {
      node.x = Math.max(75, Math.min(725, node.x + (forces[i].x + (400 - node.x) * 0.004) * cooling))
      node.y = Math.max(55, Math.min(365, node.y + (forces[i].y + (210 - node.y) * 0.004) * cooling))
    })
  }
  return result
}
