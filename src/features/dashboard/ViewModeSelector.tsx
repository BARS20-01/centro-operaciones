import { ACTIVE_VIEW_MODES, VIEW_MODES, type ViewModeId } from './viewModes'

interface Props {
  mode: ViewModeId
  onChange: (mode: ViewModeId) => void
}

export function ViewModeSelector({ mode, onChange }: Props) {
  return (
    <nav className="hud-panel flex shrink-0 flex-wrap items-center gap-1.5 rounded-lg p-1.5" aria-label="View modes">
      {ACTIVE_VIEW_MODES.map((view) => (
        <button
          key={view.id}
          type="button"
          aria-pressed={mode === view.id}
          title={view.description}
          onClick={() =>                     onChange(view.id)}
          className={`rounded border px-2.5 py-1.5 text-[10px] font-semibold tracking-wider transition-colors ${
            mode === view.id
              ? 'border-neon/70 bg-neon/15 text-neon'
              : 'border-neon/15 text-slate-400 hover:border-neon/40 hover:text-slate-200'
          }`}
        >
          {view.label}
        </button>
      ))}
      <span className="mx-1 hidden h-5 w-px bg-neon/20 md:block" />
      {VIEW_MODES.filter((view) => !view.available).map((view) => (
        <button
          key={view.id}
          type="button"
          disabled
          title={`${view.description} — planned`}
          className="cursor-not-allowed rounded border border-neon/10 px-2.5 py-1.5 text-[10px] tracking-wider text-slate-600"
        >
          {view.label}
        </button>
      ))}
    </nav>
  )
}
