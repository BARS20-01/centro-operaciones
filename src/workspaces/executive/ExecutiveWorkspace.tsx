import { Metric, Panel, WorkspaceShell } from '../shared/WorkspaceUI'

export default function ExecutiveWorkspace() {
  return (
    <WorkspaceShell variant="executive" eyebrow="Management workspace" title="Executive Overview" description="Indicadores ilustrativos para una futura vista de gestión; no son datos operativos reales.">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Metric label="Availability" value="99.9%" detail="Illustrative service availability" />
        <Metric label="Laboratory usage" value="74%" detail="Illustrative laboratory utilization" />
        <Metric label="Incident Count" value="3" detail="Illustrative open incidents" />
        <Metric label="Assets" value="24" detail="Illustrative managed assets" />
        <Metric label="Service Health" value="Healthy" detail="Illustrative service portfolio" />
        <Metric label="Operational Score" value="87 / 100" detail="Illustrative operational score" />
      </div>
      <Panel title="Operational perspective"><p className="text-sm leading-relaxed text-slate-400">This preview illustrates how leadership could assess availability, resource utilization and operational priorities in one place. No live measurements are shown.</p></Panel>
    </WorkspaceShell>
  )
}
