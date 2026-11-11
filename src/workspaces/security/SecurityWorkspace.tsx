import { Metric, Panel, WorkspaceShell } from '../shared/WorkspaceUI'
import { incidents, threatEvents } from '../shared/mock'
import { ThreatCore } from './ThreatCore'

const actions = ['Block IP', 'Quarantine Asset', 'Create Incident', 'Open Investigation', 'View Threat Graph', 'Generate AI Analysis']

export default function SecurityWorkspace() {
  return (
    <WorkspaceShell variant="security" eyebrow="Security workspace" title="Security Command" description="Demostración visual: eventos, métricas e incidentes ficticios. Sin monitorización ni acciones reales.">
      <div className="grid gap-4 xl:grid-cols-[minmax(230px,1fr)_minmax(300px,1.7fr)_minmax(230px,1fr)] xl:grid-rows-[auto_auto]">
        <Panel title="Threat Feed" className="order-2 xl:order-none xl:col-start-1 xl:row-start-1">
          <div className="space-y-3">{threatEvents.map((event) => (
            <div key={event.time} className="border-b border-slate-700/50 pb-3 last:border-0">
              <div className="flex items-center justify-between gap-2"><span className="text-xs font-medium text-slate-100">{event.event}</span><span className={event.severity === 'HIGH' ? 'text-[10px] text-rose-300' : 'text-[10px] text-amber-200'}>{event.severity}</span></div>
              <div className="mt-1 text-[10px] text-slate-400">{event.time} · {event.source}</div>
              <div className="mt-1 text-[10px] text-cyan-300">{event.status}</div>
            </div>
          ))}</div>
        </Panel>
        <Panel title="Threat Core Visualization" className="order-1 flex flex-col xl:order-none xl:col-start-2 xl:row-span-2 xl:row-start-1">
          <ThreatCore />
          <p className="text-center text-xs text-slate-400">Arrastra para explorar el núcleo. Representación conceptual, no una evaluación de seguridad.</p>
        </Panel>
        <Panel title="Threat Intelligence" className="order-3 xl:order-none xl:col-start-3 xl:row-start-1">
          <div className="space-y-3 text-xs text-slate-400"><p>Example indicator: suspicious authentication attempts</p><p>Example source: 203.0.113.17</p><p className="text-cyan-300">SIMULATED · no intelligence provider connected</p></div>
        </Panel>
        <Panel title="Security Analytics" className="order-4 xl:order-none xl:col-start-3 xl:row-start-2">
          <div className="grid grid-cols-2 gap-2">
            <Metric label="Security Score" value="86" detail="Sample score" />
            <Metric label="Active Alerts" value="24" detail="Last 24h · sample" />
            <Metric label="Attack Sources" value="12" detail="Sample sources" />
            <Metric label="Top Countries" value="3" detail="US · DE · BR" />
            <Metric label="Active Incidents" value="3" detail="Sample queue" />
            <Metric label="Blocked IPs" value="148" detail="Sample counter" />
          </div>
        </Panel>
      <Panel title="Incident Queue" className="order-5 xl:order-none xl:col-start-1 xl:row-start-2">
        <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-xs">
          <thead className="text-[10px] uppercase tracking-wider text-slate-500"><tr><th className="pb-3">Incident</th><th className="pb-3">Description</th><th className="pb-3">Asset</th><th className="pb-3">Severity</th><th className="pb-3">Status</th></tr></thead>
          <tbody>{incidents.map((incident) => <tr key={incident.id} className="border-t border-slate-800"><td className="py-3 text-cyan-300">{incident.id}</td><td>{incident.name}</td><td>{incident.asset}</td><td className="text-amber-200">{incident.severity}</td><td>{incident.status}</td></tr>)}</tbody>
        </table></div>
      </Panel>
      </div>
      <Panel title="Actions · unavailable in this preview">
        <div className="flex flex-wrap gap-2">{actions.map((action) => <button key={action} disabled title="Not implemented" className="cursor-not-allowed rounded-md border border-slate-700 bg-slate-800/40 px-3 py-2 text-xs text-slate-500">{action}</button>)}</div>
      </Panel>
    </WorkspaceShell>
  )
}
