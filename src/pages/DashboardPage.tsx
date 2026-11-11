import { useState } from 'react'
import { useMockOps } from '@/hooks/useMockOps'
import { ServiceMap } from '@/features/topology/ServiceMap'
import { KpiCard } from '@/features/dashboard/components/KpiCard'
import { ViewModeSelector } from '@/features/dashboard/ViewModeSelector'
import type { ViewModeId } from '@/features/dashboard/viewModes'
import { HealthStrip } from '@/features/health/HealthStrip'
import { MissionConsole } from '@/features/console/MissionConsole'
import { Timeline } from '@/features/timeline/Timeline'
import { Link } from 'react-router-dom'

export default function DashboardPage() {
  const { snapshot, events, history, report, dockerSource } = useMockOps()
  const [mode, setMode] = useState<ViewModeId>('nexus')

  return (
    <div className={`flex h-full flex-col gap-2 overflow-y-auto p-2 ${mode === 'operations' ? 'lg:overflow-y-auto' : 'lg:overflow-hidden'}`}>
      <HealthStrip report={report} history={history} />
      <Link to="/diagnostics" className="self-end text-xs text-neon hover:underline">System Diagnostics</Link>
      <section className="grid shrink-0 grid-cols-2 gap-2 lg:grid-cols-4" aria-label="KPIs">
        {snapshot.kpis.map((k, i) => (
          <KpiCard key={k.id} kpi={k} index={i} />
        ))}
      </section>
      <ViewModeSelector mode={mode} onChange={setMode} />
      <section
        className={`frame relative flex-1 overflow-hidden rounded-lg border border-neon/20 ${mode === 'operations' ? 'min-h-[320px]' : 'min-h-[520px]'}`}
        aria-label={`${mode} service map`}
      >
        <ServiceMap graph={snapshot.graph} report={report} dockerSource={dockerSource} mode={mode} />
      </section>
      {mode === 'operations' && (
        <section className="hud-panel h-[210px] shrink-0 overflow-hidden rounded-lg" aria-label="Operational timeline">
          <Timeline events={events} />
        </section>
      )}
      <div className="shrink-0">
        <MissionConsole events={events} operationsMode={mode === 'operations'} />
      </div>
    </div>
  )
}
