import type { ReactNode } from 'react'

export function WorkspaceShell({ eyebrow, title, description, children, variant }: {
  eyebrow: string; title: string; description: string; children: ReactNode; variant: 'security' | 'twin' | 'ai' | 'executive' | 'homelab'
}) {
  return (
    <div className={`workspace-shell workspace-${variant} h-full overflow-y-auto p-3 sm:p-5`}>
      <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-300">{eyebrow}</p>
            <h2 className="mt-1 text-xl font-semibold tracking-wide text-slate-100 sm:text-2xl">{title}</h2>
            <p className="mt-1 text-xs text-slate-400">{description}</p>
          </div>
          <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-[10px] font-bold tracking-wider text-amber-200">SIMULATED · MOCK DATA</span>
        </header>
        {children}
      </div>
    </div>
  )
}

export function Panel({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`workspace-panel rounded-xl p-4 ${className}`}>
      <h3 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">{title}</h3>
      {children}
    </section>
  )
}

export function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-lg border border-slate-700/60 bg-slate-950/50 p-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className="mt-2 text-xl font-semibold text-slate-100">{value}</div>
      <div className="mt-1 text-[10px] text-slate-500">{detail}</div>
    </div>
  )
}
