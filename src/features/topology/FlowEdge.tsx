import { memo } from 'react'
import { BaseEdge, getBezierPath, type Edge, type EdgeProps } from '@xyflow/react'

export interface FlowEdgeData extends Record<string, unknown> {
  /** "hosts": parent -> child tree edge. "depends": secondary dependency. */
  kind: 'hosts' | 'depends'
  color: string
  /** Particles travelling along the edge (0 disables them for large graphs). */
  particles: number
  /** Seconds a particle needs to reach the target. */
  duration: number
  active: boolean
  dim: boolean
  /** The edge carries impact: thicker, glowing, and always animated. */
  impact?: boolean
  /** Particles travel target -> source (impact flowing from a dependency to its dependents). */
  reverse?: boolean
  emphasis?: boolean
}

export type FlowEdgeType = Edge<FlowEdgeData, 'flow'>

/** Dependencies arc above the row so they never run through sibling nodes. */
function dependencyPath(sx: number, sy: number, tx: number, ty: number) {
  const lift = Math.min(40 + Math.abs(tx - sx) * 0.12, 120)
  return `M ${sx} ${sy} C ${sx} ${sy - lift}, ${tx} ${ty - lift}, ${tx} ${ty}`
}

function FlowEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  data,
}: EdgeProps<FlowEdgeType>) {
  const {
    kind = 'hosts',
    color = 'var(--theme-primary)',
    particles = 0,
    duration = 3,
    active = true,
    dim = false,
    impact = false,
    reverse = false,
    emphasis = false,
  } = data ?? {}
  const depends = kind === 'depends'
  const path = depends
    ? dependencyPath(sourceX, sourceY, targetX, targetY)
    : getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })[0]

  return (
    <g style={{ opacity: dim ? 0.1 : 1, transition: 'opacity .3s' }}>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={{
          stroke: color,
          strokeOpacity: impact ? 0.6 : depends ? emphasis ? 0.8 : 0.4 : 0.18,
          strokeWidth: impact ? 4 : depends ? emphasis ? 2.5 : 1.5 : 3,
          filter: impact ? `drop-shadow(0 0 4px ${color})` : undefined,
        }}
      />
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeOpacity={active ? 0.85 : 0.25}
        strokeWidth={1.5}
        strokeDasharray={depends ? '8 6' : active ? '4 12' : '2 8'}
        className={active ? 'edge-flow' : undefined}
      />
      {active &&
        Array.from({ length: impact ? Math.max(particles, 2) : particles }, (_, i) => i).map((i, _k, all) => (
          <circle key={i} r={impact ? 4 : 3.5} fill={color} style={{ filter: `drop-shadow(0 0 5px ${color})` }}>
            <animateMotion
              dur={`${duration}s`}
              begin={`${-(duration / all.length) * i}s`}
              repeatCount="indefinite"
              path={path}
              {...(reverse ? { keyPoints: '1;0', keyTimes: '0;1', calcMode: 'linear' } : {})}
            />
          </circle>
        ))}
    </g>
  )
}

export const FlowEdge = memo(FlowEdgeComponent)
