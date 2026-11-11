import { memo, useContext } from 'react'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { motion } from 'framer-motion'
import { ChevronDown, ChevronRight, TriangleAlert } from 'lucide-react'
import { criticalityMeta, healthColor, layerMeta } from '@/lib/status'
import type { Criticality, Health, TwinNode } from '@/types'
import { TwinActions } from './actions'
import { kindIcons } from './icons'
import { NODE_SIZE, type NodeOrientation } from './layout'
import { nodeSourceStatus } from '@/features/diagnostics/sourceManager'
import { useOperationalStatus } from '@/features/diagnostics/operationalStatusContext'

export interface ServiceFlags {
  /** Effective health: the reported status, or `impacted` when propagated from upstream. */
  health: Health
  criticality: Criticality
  orientation: NodeOrientation
  /** Name of the failing upstream node that impacts this one, if any. */
  cause?: string
  dim: boolean
  selected: boolean
  expandable: boolean
  collapsed: boolean
  hiddenCount: number
}

export interface ServiceData extends ServiceFlags, Record<string, unknown> {
  node: TwinNode
}

export type ServiceNodeType = Node<ServiceData, 'service'>

function CriticalityPips({ level }: { level: Criticality }) {
  const { pips, color, label } = criticalityMeta[level]
  return (
    <span className="flex shrink-0 items-end gap-px" title={`Criticidad ${label}`} aria-label={`Criticidad ${label}`}>
      {[1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className="w-[3px] rounded-[1px]"
          style={{ height: 3 + i * 2, background: i <= pips ? color : 'var(--theme-connection)' }}
        />
      ))}
    </span>
  )
}

function ServiceNodeComponent({ data }: NodeProps<ServiceNodeType>) {
  const { node, health, criticality, orientation, cause, dim, selected, expandable, collapsed, hiddenCount } = data
  const { toggle } = useContext(TwinActions)
  const { readings } = useOperationalStatus()
  const Icon = kindIcons[node.kind]
  const color = healthColor[health]
  const accent = layerMeta[node.layer].color
  const impacted = health === 'impacted'
  const failing = health === 'critical'

  return (
    <motion.div
      whileHover={{ scale: 1.06 }}
      title={impacted ? `Impactado por ${cause ?? 'upstream'}` : undefined}
      className="hud-panel relative flex cursor-pointer items-center gap-2 overflow-hidden rounded-md pl-3 pr-2"
      style={{
        width: NODE_SIZE.w,
        height: NODE_SIZE.h,
        borderColor: selected
          ? 'var(--theme-primary)'
          : `color-mix(in srgb, ${color} ${impacted ? 80 : 60}%, transparent)`,
        borderStyle: impacted ? 'dashed' : 'solid',
        boxShadow: `0 0 ${selected ? 22 : impacted ? 20 : 14}px color-mix(in srgb, ${color} ${selected ? 53 : impacted ? 40 : 27}%, transparent), inset 0 0 12px color-mix(in srgb, ${color} ${impacted ? 20 : 10}%, transparent)`,
        opacity: dim ? 0.2 : health === 'offline' ? 0.55 : 1,
        transition: 'opacity .3s, border-color .6s, box-shadow .6s',
      }}
    >
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: accent }} />
      {(failing || impacted) && <span className="alert-ring absolute inset-0 rounded-md" style={{ borderColor: color }} />}
      <Icon className="size-4 shrink-0" style={{ color }} />
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-xs font-semibold tracking-wide text-slate-100">{node.name}</span>
        <span className="flex items-center gap-1 text-[9px] font-semibold tracking-wider text-neon/80">
          <span>{nodeSourceStatus(node, readings)}</span>
          {impacted && <><TriangleAlert className="size-2.5 shrink-0" style={{ color }} /><span className="truncate" style={{ color }}>impactado{cause ? ` · ${cause}` : ''}</span></>}
        </span>
      </span>
      {expandable && (
        <button
          className="nodrag nopan flex shrink-0 items-center rounded border border-neon/30 px-1 text-[10px] text-slate-300 hover:bg-neon/15"
          onClick={(e) => {
            e.stopPropagation()
            toggle(node.id)
          }}
          aria-label={collapsed ? `Expandir ${node.name}` : `Colapsar ${node.name}`}
          aria-expanded={!collapsed}
        >
          {collapsed ? <ChevronRight className="size-3" /> : <ChevronDown className="size-3" />}
          {collapsed && <span className="tabular-nums">+{hiddenCount}</span>}
        </button>
      )}
      <CriticalityPips level={criticality} />
      <span className="relative flex size-2.5 shrink-0">
        {health !== 'offline' && (
          <span className="absolute inset-0 animate-ping rounded-full" style={{ background: color, opacity: 0.6 }} />
        )}
        <span className="relative size-2.5 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
      </span>
      <Handle id="in" type="target" position={orientation === 'horizontal' ? Position.Left : Position.Top} isConnectable={false} />
      <Handle id="out" type="source" position={orientation === 'horizontal' ? Position.Right : Position.Bottom} isConnectable={false} />
      <Handle
        id="dep-out"
        type="source"
        position={orientation === 'horizontal' ? Position.Bottom : Position.Top}
        style={{ left: '30%' }}
        isConnectable={false}
      />
      <Handle
        id="dep-in"
        type="target"
        position={orientation === 'horizontal' ? Position.Bottom : Position.Top}
        style={{ left: '70%' }}
        isConnectable={false}
      />
    </motion.div>
  )
}

export const ServiceNode = memo(ServiceNodeComponent)
