import { Metric, Panel, WorkspaceShell } from '../shared/WorkspaceUI'
import { topology } from '../shared/mock'
import { LivingMap } from './LivingMap'

export default function DigitalTwinWorkspace() {
  return (
    <WorkspaceShell variant="twin" eyebrow="Infrastructure workspace" title="Digital Twin" description="Topología de demostración; no representa el inventario ni el estado LIVE.">
      <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)_220px]">
        <Panel title="Infrastructure Inventory" className="order-2 xl:order-none">
          <ul className="space-y-3">{topology.map((node) => <li key={node.id} className="border-b border-slate-800 pb-2"><div className="text-xs text-slate-200">{node.label}</div><div className="mt-1 text-[10px] text-slate-500">{node.category}</div></li>)}</ul>
        </Panel>
        <Panel title="Living Infrastructure Map" className="order-1 xl:order-none">
          <LivingMap />
        </Panel>
        <Panel title="Infrastructure Health" className="order-3 xl:order-none">
          <div className="grid grid-cols-2 gap-2 xl:grid-cols-1">
            <Metric label="Memory" value="64%" detail="Sample usage" />
            <Metric label="CPU" value="38%" detail="Sample usage" />
            <Metric label="Storage" value="71%" detail="Sample usage" />
            <Metric label="Availability" value="99.9%" detail="Sample availability" />
            <Metric label="Services" value="12" detail="Sample services" />
          </div>
        </Panel>
      </div>
    </WorkspaceShell>
  )
}
