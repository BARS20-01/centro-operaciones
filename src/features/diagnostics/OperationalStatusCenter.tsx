import { lazy, Suspense, useRef, useState } from 'react'
import { Activity, X } from 'lucide-react'
import { SourceBadges } from './SourceBadges'

const Diagnostics = lazy(() => import('@/pages/SystemDiagnosticsPage'))

export function OperationalStatusCenter() {
  const dialog = useRef<HTMLDialogElement>(null)
  const [open, setOpen] = useState(false)

  return (
    <>
      <button type="button" onClick={() => { setOpen(true); dialog.current?.showModal() }}
        aria-haspopup="dialog" aria-controls="system-diagnostics-panel" aria-expanded={open}
        className="inline-flex items-center gap-2 rounded border border-neon/30 bg-neon/5 px-2.5 py-1.5 text-xs hover:bg-neon/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neon">
        <Activity aria-hidden="true" className="size-4 text-neon" />
        <span className="font-semibold text-slate-200">Operational Status</span>
        <SourceBadges />
      </button>
      <dialog id="system-diagnostics-panel" ref={dialog} onClose={() => setOpen(false)} aria-label="System Diagnostics"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            dialog.current?.close()
          }
        }}
        className="fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-dvh w-full max-w-3xl overflow-hidden border-l border-neon/30 bg-void text-slate-100 shadow-2xl backdrop:bg-black/70">
        {open && <>
          <div className="flex items-center justify-end border-b border-neon/20 px-4 py-2">
            <button type="button" autoFocus onClick={() => dialog.current?.close()} className="inline-flex items-center gap-2 rounded border border-neon/30 px-3 py-1 text-xs text-neon hover:bg-neon/10 focus-visible:outline-2 focus-visible:outline-neon">
              <X className="size-4" aria-hidden="true" /> Cerrar
            </button>
          </div>
          <div className="h-[calc(100%-3rem)]">
            <Suspense fallback={<div className="p-6 text-neon" role="status">Cargando Diagnostics…</div>}><Diagnostics /></Suspense>
          </div>
        </>}
      </dialog>
    </>
  )
}
