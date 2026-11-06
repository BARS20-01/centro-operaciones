import { useMockOps } from '@/hooks/useMockOps'
import { ServiceMap } from '@/features/topology/ServiceMap'
import { KpiCard } from '@/features/dashboard/components/KpiCard'
import { HealthStrip } from '@/features/health/HealthStrip'
import { MissionConsole } from '@/features/console/MissionConsole'

export default function DashboardPage() {
  const { snapshot, events, history, report } = useMockOps()

  return (
    <div className="flex h-full flex-col gap-2 overflow-y-auto p-2 lg:overflow-hidden">
      <HealthStrip report={report} history={history} />
      <section className="grid shrink-0 grid-cols-2 gap-2 lg:grid-cols-4" aria-label="KPIs">
        {snapshot.kpis.map((k, i) => (
          <KpiCard key={k.id} kpi={k} index={i} />
        ))}
      </section>
      <section
        className="frame relative min-h-[520px] flex-1 overflow-hidden rounded-lg border border-neon/20"
        aria-label="Service map"
      >
        <ServiceMap graph={snapshot.graph} report={report} />
      </section>
      <div className="shrink-0">
        <MissionConsole events={events} />
      </div>
    </div>
  )
}
