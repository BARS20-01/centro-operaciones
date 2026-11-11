import { lazy, Suspense } from 'react'
import { SceneFrame } from '../shared/SceneFrame'

const Scene = lazy(() => import('./ThreatCoreScene'))
function StaticCore() {
  return <div aria-hidden="true" className="static-threat-core"><div /></div>
}

export function ThreatCore() {
  return (
    <SceneFrame workspace="security" label="Representación simulada de la postura de seguridad" fallback={<StaticCore />}>
      <Suspense fallback={<StaticCore />}><Scene fallback={<StaticCore />} /></Suspense>
      <div className="pointer-events-none absolute inset-x-0 bottom-2 text-center text-[10px] uppercase tracking-[0.22em] text-cyan-200/70">Security posture · simulated</div>
    </SceneFrame>
  )
}
