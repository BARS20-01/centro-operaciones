import { useMemo, useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import { useWorkspace } from '../workspace-context'
import { topology, topologyEdges } from '../shared/mock'
import { forceLayout } from './forceLayout'

export function LivingMap({ hidden }: { hidden: ReadonlySet<string> }) {
  const signature = [...hidden].sort().join('|')
  const { visible, edges, nodes } = useMemo(() => {
    const excluded = new Set(signature ? signature.split('|') : [])
    const visible = topology.filter((node) => !excluded.has(node.id))
    const edges = topologyEdges.filter(([from, to]) => !excluded.has(from) && !excluded.has(to))
    return { visible, edges, nodes: forceLayout(visible, edges) }
  }, [signature])
  const [selected, setSelected] = useState<string>('pve')
  const { workspace } = useWorkspace()
  const reduced = useReducedMotion()
  const active = !reduced && workspace === 'digital-twin'
  const selectedNode = visible.find((node) => node.id === selected) ?? visible[0]
  const selectedId = selectedNode.id
  const related = edges.flatMap(([a, b]) => a === selectedId ? [b] : b === selectedId ? [a] : [])

  return <div className="living-map">
    <div className="living-map-header"><span>LIVE-STYLE TOPOLOGY / SIMULATED</span><span>{nodes.length.toString().padStart(2, '0')} ENTITIES</span></div>
    <svg viewBox="0 0 800 420" className="w-full" role="img" aria-label="Mapa de infraestructura simulado con relaciones entre Proxmox, máquinas virtuales, contenedores, aplicaciones, laboratorios, redes y almacenamiento">
      <defs><radialGradient id="node-glow"><stop stopColor="#2dd4bf" stopOpacity=".4" /><stop offset="1" stopColor="#2dd4bf" stopOpacity="0" /></radialGradient></defs>
      {edges.map(([from, to]) => {
        const a = nodes.find((node) => node.id === from)!
        const b = nodes.find((node) => node.id === to)!
        const highlighted = selectedId === from || selectedId === to
        return <g key={`${from}-${to}`}>
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={highlighted ? '#6ee7d6' : '#275b65'} strokeWidth={highlighted ? 2 : 1} strokeDasharray={highlighted ? '5 5' : undefined} />
          {active && <circle r={highlighted ? 3 : 2} fill="#a5f3fc"><animateMotion dur={highlighted ? '3s' : '5s'} repeatCount="indefinite" path={`M ${a.x} ${a.y} L ${b.x} ${b.y}`} /></circle>}
        </g>
      })}
      {nodes.map((node) => {
        const source = topology.find((item) => item.id === node.id)!
        return <g key={node.id} transform={`translate(${node.x},${node.y})`} onClick={() => setSelected(node.id)} className="cursor-pointer">
          <circle r="45" fill="url(#node-glow)" /><circle r={selectedId === node.id ? 19 : 15} fill="#0c2530" stroke={selectedId === node.id ? '#a5fff0' : '#53c6c2'} strokeWidth="1.5" />
          <circle r="4" fill="#9ffff1" /><text y="34" textAnchor="middle" fill="#c8f7ef" fontSize="11">{source.label}</text>
        </g>
      })}
    </svg>
    <div className="living-map-detail"><div><span>SELECTED ENTITY</span><strong>{selectedNode.label}</strong><small>{selectedNode.category} · {related.length} simulated relationships</small></div>
      <div className="flex flex-wrap gap-1">{visible.map((node) => <button type="button" key={node.id} onClick={() => setSelected(node.id)} aria-pressed={selectedId === node.id} className="map-node-button">{node.label}</button>)}</div>
    </div>
  </div>
}
