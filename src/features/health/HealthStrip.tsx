import { memo } from 'react'
import { motion } from 'framer-motion'
import { Activity, ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react'
import { HEALTH_LEVELS, OPERATIONAL_LABELS, type HealthReport } from '@/domain/health'
import { healthColor, healthLabel } from '@/lib/status'
import type { Health } from '@/types'

const STATES: Health[] = ['ok', 'warn', 'impacted', 'offline', 'critical']

function Trace({ data, color }: { data: number[]; color: string }) {
  const pts = data.map((v, i) => `${(i / Math.max(1, data.length - 1)) * 100},${30 - (v / 100) * 28}`).join(' ')
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="h-9 w-full min-w-16" aria-hidden>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function Pillar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-1 text-[9px] uppercase tracking-wider text-slate-500">
        <span className="truncate">{label}</span>
        <span className="tabular-nums text-slate-300">{Math.round(value)}</span>
      </div>
      <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-slate-800">
        <motion.div className="h-full rounded-full" style={{ background: color }} animate={{ width: `${value}%` }} transition={{ duration: 0.8 }} />
      </div>
    </div>
  )
}

interface Props {
  report: HealthReport
  history: number[]
}

/** Top-of-dashboard readout: NEXUS HEALTH, Operational Score and node state counters. */
function HealthStripComponent({ report, history }: Props) {
  const { nexus, operational, model } = report
  const level = HEALTH_LEVELS[nexus.level]
  const opColor = OPERATIONAL_LABELS[operational.label]
  const TrendIcon = operational.trend === 'up' ? ArrowUpRight : operational.trend === 'down' ? ArrowDownRight : ArrowRight
  const trendColor = operational.trend === 'down' ? '#fb7185' : operational.trend === 'up' ? '#34d399' : '#94a3b8'
  const { components } = nexus

  return (
    <section
      aria-label="Nexus health"
      className="hud-panel grid shrink-0 gap-x-6 gap-y-2 rounded-lg px-4 py-2.5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1.5fr)_auto]"
    >
      <div className="flex items-center gap-4">
        <div className="shrink-0">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.25em] text-slate-400">
            <Activity className="size-3.5" style={{ color: level.color }} /> Nexus Health
          </div>
          <div className="flex items-baseline gap-2">
            <span
              className="font-display text-4xl font-bold tabular-nums leading-none text-slate-100"
              style={{ textShadow: `0 0 14px ${level.color}99` }}
              aria-label={`Nexus health ${nexus.score} de 100`}
            >
              {nexus.score}
            </span>
            <span className="text-xs text-slate-500">/ 100</span>
            <span
              className="rounded border px-1.5 py-0.5 text-[10px] font-bold tracking-widest"
              style={{ color: level.color, borderColor: `${level.color}88`, background: `${level.color}14` }}
            >
              {level.label}
            </span>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
            <motion.div
              className="h-full rounded-full"
              style={{ background: level.color, boxShadow: `0 0 8px ${level.color}` }}
              animate={{ width: `${nexus.score}%` }}
              transition={{ duration: 0.8 }}
            />
          </div>
          <Trace data={history} color={level.color} />
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="shrink-0">
          <div className="text-[10px] uppercase tracking-[0.25em] text-slate-400">Operational Score</div>
          <div className="flex items-baseline gap-2">
            <span className="font-display text-2xl font-bold tabular-nums text-slate-100">{operational.score}</span>
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: opColor }}>
              {operational.label}
            </span>
            <span
              className="flex items-center"
              title={`Tendencia de NEXUS HEALTH: ${operational.delta > 0 ? '+' : ''}${operational.delta}`}
            >
              <TrendIcon className="size-3.5" style={{ color: trendColor }} />
            </span>
          </div>
        </div>
        <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-4">
          <Pillar label="Salud" value={operational.pillars.health} color={level.color} />
          <Pillar label="Dependencias" value={operational.pillars.dependencies} color="#c084fc" />
          <Pillar label="Disponibilidad" value={operational.pillars.availability} color="#22d3ee" />
          <Pillar label="Tendencia" value={operational.pillars.trend} color="#60a5fa" />
        </div>
      </div>

      <div className="flex flex-col justify-center gap-1">
        <div className="flex flex-wrap gap-1" aria-label="Estado de los nodos">
          {STATES.map((s) => (
            <span
              key={s}
              className="flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] tabular-nums"
              style={{ color: healthColor[s], borderColor: `${healthColor[s]}${model.counts[s] ? '88' : '33'}`, opacity: model.counts[s] ? 1 : 0.45 }}
            >
              <span className="size-1.5 rounded-full" style={{ background: healthColor[s] }} />
              {healthLabel[s]} {model.counts[s]}
            </span>
          ))}
        </div>
        <div className="text-[9px] uppercase tracking-wider text-slate-500">
          Recursos {Math.round(components.resources)} · Alertas {Math.round(components.alerts)} · Críticos {Math.round(components.criticalNodes)}
        </div>
      </div>
    </section>
  )
}

export const HealthStrip = memo(HealthStripComponent)
