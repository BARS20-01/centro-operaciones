import { Panel, WorkspaceShell } from '../shared/WorkspaceUI'
import { KnowledgeGraph } from './KnowledgeGraph'

const insights = [
  ['Recommendations', 'Review capacity planning for the application environment.'],
  ['Infrastructure Insights', 'Sample workload distribution suggests room for optimization.'],
  ['Security Insights', 'Review the example incident queue during the next exercise.'],
  ['Predictions', 'Example forecast: review capacity before the next planning cycle.'],
  ['Operational Summary', 'A simulated operational summary will appear here.'],
] as const

export default function AIWorkspace() {
  return (
    <WorkspaceShell variant="ai" eyebrow="Future AI workspace" title="AI Operations" description="Vista conceptual con contenido de ejemplo. No hay un proveedor de IA conectado.">
      <div className="grid gap-4 xl:grid-cols-[minmax(230px,1fr)_minmax(300px,1.5fr)_minmax(230px,1fr)]">
        <Panel title="AI Assistant" className="order-2 xl:order-none">
          <div className="space-y-4 text-sm">
            <div className="ml-auto max-w-md rounded-xl bg-indigo-500/15 p-4 text-slate-300">Summarize today&apos;s operational priorities.</div>
            <div className="max-w-lg rounded-xl border border-cyan-400/20 bg-cyan-400/5 p-4 text-slate-300">Example response: review availability, investigate simulated alerts, and confirm capacity trends. This text is prewritten, not AI-generated.</div>
          </div>
          <div className="mt-8 rounded-lg border border-slate-700 px-4 py-3 text-xs text-slate-500">Chat unavailable · future integration placeholder</div>
        </Panel>
        <Panel title="Knowledge Core" className="order-1 xl:order-none"><KnowledgeGraph /><p className="mt-4 text-center text-xs text-slate-500">Conceptual relationships · simulated</p></Panel>
        <div className="order-3 grid gap-4 sm:grid-cols-2 xl:order-none xl:grid-cols-1">{insights.map(([title, text]) => <Panel key={title} title={title}><p className="text-xs leading-relaxed text-slate-400">{text}</p></Panel>)}</div>
      </div>
    </WorkspaceShell>
  )
}
