import { lazy, Suspense } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useWorkspace } from './workspace-context'
import { WORKSPACES } from './workspace'

const Operations = lazy(() => import('./operations/OperationsWorkspace'))
const Security = lazy(() => import('./security/SecurityWorkspace'))
const DigitalTwin = lazy(() => import('./digital-twin/DigitalTwinWorkspace'))
const AI = lazy(() => import('./ai/AIWorkspace'))
const Executive = lazy(() => import('./executive/ExecutiveWorkspace'))
const Homelab = lazy(() => import('./homelab/HomelabWorkspace'))

export default function WorkspaceView() {
  const { workspace, visited } = useWorkspace()
  const reduced = useReducedMotion()
  const components = { operations: Operations, security: Security, 'digital-twin': DigitalTwin, ai: AI, executive: Executive, homelab: Homelab }
  return (
    <div className="relative h-full">
      {WORKSPACES.filter(({ id }) => visited.includes(id) || id === workspace).map(({ id }) => {
        const Component = components[id]
        const active = id === workspace
        return (
          <motion.div key={id} className="absolute inset-0" inert={!active}
            initial={reduced ? false : { opacity: 0, scale: 0.99 }}
            animate={active ? { opacity: 1, scale: 1, visibility: 'visible' } : { opacity: 0, scale: reduced ? 1 : 0.99, transitionEnd: { visibility: 'hidden' } }}
            transition={{ duration: reduced ? 0 : 0.25 }} style={{ pointerEvents: active ? 'auto' : 'none', zIndex: active ? 1 : 0 }}>
            <Suspense fallback={<div className="p-6 text-neon" role="status">Cargando workspace…</div>}>
              <Component />
            </Suspense>
          </motion.div>
        )
      })}
    </div>
  )
}
