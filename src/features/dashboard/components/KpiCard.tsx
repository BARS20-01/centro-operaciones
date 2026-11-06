import { motion } from 'framer-motion'
import { Cpu, HardDrive, MemoryStick, Boxes, type LucideProps } from 'lucide-react'
import type { ComponentType } from 'react'
import { statusColor } from '@/lib/status'
import type { Kpi } from '@/types'

const icons: Record<Kpi['id'], ComponentType<LucideProps>> = {
  cpu: Cpu,
  ram: MemoryStick,
  disk: HardDrive,
  services: Boxes,
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data, 100)
  const min = Math.min(...data, 0)
  const pts = data
    .map((v, i) => `${(i / (data.length - 1)) * 100},${30 - ((v - min) / (max - min || 1)) * 28}`)
    .join(' ')
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="h-8 w-full">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

export function KpiCard({ kpi, index }: { kpi: Kpi; index: number }) {
  const Icon = icons[kpi.id]
  const color = statusColor[kpi.status]

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08 }}
      className="hud-panel rounded-lg p-4"
      aria-label={kpi.label}
    >
      <div className="flex items-center justify-between text-[11px] uppercase tracking-widest text-slate-400">
        <span>{kpi.label}</span>
        <Icon className="size-4" style={{ color }} />
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="font-display text-3xl font-bold tabular-nums text-slate-100" style={{ textShadow: `0 0 12px ${color}88` }}>
          {Math.round(kpi.value)}
        </span>
        <span className="text-xs text-slate-500">{kpi.unit}</span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-800">
        <motion.div
          className="h-full rounded-full"
          style={{ background: color, boxShadow: `0 0 8px ${color}` }}
          animate={{ width: `${kpi.percent}%` }}
          transition={{ duration: 0.8 }}
        />
      </div>
      <Sparkline data={kpi.history} color={color} />
    </motion.article>
  )
}
