import { memo } from 'react'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'

export type ClusterNodeType = Node<{ label: string; count: number }, 'cluster'>

function ClusterNodeComponent({ data }: NodeProps<ClusterNodeType>) {
  return (
    <div className="size-full rounded-lg border border-dashed border-neon/30 bg-neon/[0.03]">
      <div className="px-3 pt-1.5 text-[10px] uppercase tracking-widest text-slate-500">
        {data.label} · {data.count}
      </div>
      <Handle id="in" type="target" position={Position.Top} isConnectable={false} />
    </div>
  )
}

export const ClusterNode = memo(ClusterNodeComponent)
