import { memo, useContext } from 'react'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { motion } from 'framer-motion'
import { ChevronDown, ChevronRight, Cpu } from 'lucide-react'
import { statusColor } from '@/lib/status'
import type { Status } from '@/types'
import { TwinActions } from './actions'
import { CORE_SIZE, type NodeOrientation } from './layout'
import type { OperationalStatus } from '@/features/diagnostics/operationalStatus'

export type CoreNodeType = Node<
  { id: string; label: string; sourceClass: OperationalStatus; status: Status; levelLabel: string; orientation: NodeOrientation; dim: boolean; expandable: boolean; collapsed: boolean; hiddenCount: number },
  'core'
>

const PARTICLES = Array.from({ length: 14 }, (_, i) => i)
const TICKS = Array.from({ length: 60 }, (_, i) => i)

const fill = { position: 'absolute', inset: 0 } as const

function CoreNodeComponent({ data }: NodeProps<CoreNodeType>) {
  const { toggle } = useContext(TwinActions)
  const color = statusColor[data.status]
  const label = data.levelLabel

  return (
    <div
      className="relative"
      style={{ width: CORE_SIZE, height: CORE_SIZE, color, opacity: data.dim ? 0.3 : 1, transition: 'opacity .3s' }}
    >
      {/* ambient glow breathing */}
      <motion.div
        style={{
          ...fill,
          background: `radial-gradient(circle, color-mix(in srgb, ${color} 33%, transparent) 0%, color-mix(in srgb, ${color} 8%, transparent) 40%, transparent 70%)`,
        }}
        animate={{ scale: [0.9, 1.15, 0.9], opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* expanding pulses */}
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="absolute rounded-full border"
          style={{ inset: '30%', borderColor: color }}
          animate={{ scale: [1, 2.4], opacity: [0.55, 0] }}
          transition={{ duration: 4.5, repeat: Infinity, delay: i * 1.5, ease: 'easeOut' }}
        />
      ))}

      {/* radial data particles */}
      {PARTICLES.map((i) => (
        <span key={i} style={{ ...fill, transform: `rotate(${(i * 360) / PARTICLES.length}deg)` }}>
          <motion.span
            className="absolute left-1/2 top-1/2 size-1 rounded-full"
            style={{ background: color, boxShadow: `0 0 6px ${color}` }}
            animate={{ x: [60, 150], opacity: [0, 1, 0] }}
            transition={{ duration: 2.4, repeat: Infinity, delay: (i % 7) * 0.35, ease: 'easeOut' }}
          />
        </span>
      ))}

      {/* orbital rings */}
      <motion.svg viewBox="-100 -100 200 200" style={fill} animate={{ rotate: 360 }} transition={{ duration: 60, repeat: Infinity, ease: 'linear' }}>
        <circle r={96} fill="none" stroke="currentColor" strokeOpacity={0.35} strokeWidth={0.6} />
        {TICKS.map((i) => (
          <line key={i} x1={0} y1={-96} x2={0} y2={i % 5 === 0 ? -89 : -92.5} stroke="currentColor" strokeOpacity={0.6} strokeWidth={i % 5 === 0 ? 1 : 0.5} transform={`rotate(${i * 6})`} />
        ))}
      </motion.svg>
      <motion.svg viewBox="-100 -100 200 200" style={fill} animate={{ rotate: -360 }} transition={{ duration: 28, repeat: Infinity, ease: 'linear' }}>
        <circle r={78} fill="none" stroke="var(--theme-secondary)" strokeOpacity={0.7} strokeWidth={1.5} strokeDasharray="60 40 20 40" />
        <circle cx={0} cy={-78} r={3} fill="var(--theme-secondary)" style={{ filter: 'drop-shadow(0 0 5px var(--theme-secondary))' }} />
      </motion.svg>
      <motion.svg viewBox="-100 -100 200 200" style={fill} animate={{ rotate: 360 }} transition={{ duration: 14, repeat: Infinity, ease: 'linear' }}>
        <circle r={62} fill="none" stroke="currentColor" strokeWidth={1} strokeDasharray="2 6" strokeOpacity={0.8} />
        <circle cx={62} cy={0} r={2.5} fill="currentColor" style={{ filter: 'drop-shadow(0 0 5px currentColor)' }} />
        <circle cx={-62} cy={0} r={2.5} fill="currentColor" style={{ filter: 'drop-shadow(0 0 5px currentColor)' }} />
      </motion.svg>

      {/* nucleus */}
      <motion.div
        className="absolute flex flex-col items-center justify-center rounded-full bg-void"
        style={{
          inset: '27%',
          border: `2px solid ${color}`,
          boxShadow: `0 0 50px color-mix(in srgb, ${color} 53%, transparent), inset 0 0 30px color-mix(in srgb, ${color} 27%, transparent)`,
        }}
        animate={{ scale: [1, 1.05, 1] }}
        transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
      >
        <Cpu className="size-8" />
        <span className="mt-1 font-display text-sm font-black tracking-[0.15em] text-white" style={{ textShadow: `0 0 14px ${color}` }}>
          {data.label}
        </span>
        <span className="text-[9px] tracking-[0.25em] text-slate-400">{data.id.toUpperCase()}</span>
        <span className="text-[10px] font-semibold text-slate-200">{data.sourceClass}</span>
        <span className="text-[10px] font-bold tracking-[0.3em]">{label}</span>
        {data.expandable && (
          <button
            className="nodrag nopan mt-1 flex items-center rounded border border-current/40 px-1.5 text-[10px] text-slate-300 hover:bg-white/10"
            onClick={(e) => {
              e.stopPropagation()
              toggle(data.id)
            }}
            aria-expanded={!data.collapsed}
            aria-label={data.collapsed ? 'Expandir NEXUS CORE' : 'Colapsar NEXUS CORE'}
          >
            {data.collapsed ? <ChevronRight className="size-3" /> : <ChevronDown className="size-3" />}
            {data.collapsed && <span className="tabular-nums">+{data.hiddenCount}</span>}
          </button>
        )}
      </motion.div>

      <Handle id="in" type="target" position={data.orientation === 'horizontal' ? Position.Left : Position.Top} isConnectable={false} />
      <Handle id="out" type="source" position={data.orientation === 'horizontal' ? Position.Right : Position.Bottom} isConnectable={false} />
    </div>
  )
}

export const CoreNode = memo(CoreNodeComponent)
