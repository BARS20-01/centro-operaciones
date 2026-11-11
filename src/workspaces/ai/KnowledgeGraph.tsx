import { lazy, Suspense, useState } from 'react'
import { SceneFrame } from '../shared/SceneFrame'
import { knowledgeLabels, relatedEntities, type KnowledgeEntity } from './knowledge'

const Scene = lazy(() => import('./KnowledgeGraphScene'))

function Fallback() {
  return <svg viewBox="0 0 400 240" className="h-full w-full" aria-hidden="true">
    {[0, 1, 2, 3, 4, 5].map((i) => {
      const angle = i * Math.PI / 3
      return <g key={i}><line x1="200" y1="120" x2={200 + Math.cos(angle) * 100} y2={120 + Math.sin(angle) * 85} stroke="#8b78df" /><circle cx={200 + Math.cos(angle) * 100} cy={120 + Math.sin(angle) * 85} r="7" fill="#67e8f9" /></g>
    })}
    <circle cx="200" cy="120" r="13" fill="#b79aff" />
  </svg>
}

export function KnowledgeGraph() {
  const [selected, setSelected] = useState<KnowledgeEntity>('Infrastructure')
  return <>
    <SceneFrame workspace="ai" label="Grafo 3D de conocimiento simulado" fallback={<Fallback />}>
      <Suspense fallback={<Fallback />}><Scene fallback={<Fallback />} selected={selected} /></Suspense>
    </SceneFrame>
    <div className="flex flex-wrap justify-center gap-2">{knowledgeLabels.map((label) => <button type="button" key={label} onClick={() => setSelected(label)} aria-pressed={selected === label} className="map-node-button">{label}</button>)}</div>
    <p className="mt-4 text-center text-xs text-violet-200" aria-live="polite">{selected} · related: {relatedEntities(selected).join(', ')}</p>
  </>
}
