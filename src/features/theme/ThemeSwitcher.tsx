import { Palette } from 'lucide-react'
import { useTheme } from './theme-context'
import { THEMES } from './themes'

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme()

  return (
    <div className="flex items-center gap-1.5">
      <Palette aria-hidden className="size-3.5 text-neon/80" />
      <label htmlFor="theme-switcher" className="sr-only">
        Tema visual
      </label>
      <select
        id="theme-switcher"
        value={theme.id}
        onChange={(event) => {
          const selected = THEMES.find((option) => option.id === event.target.value)
          if (selected) setTheme(selected.id)
        }}
        className="max-w-28 cursor-pointer rounded border border-neon/25 bg-panel px-2 py-1 text-[10px] font-semibold tracking-wider text-slate-100 outline-none transition-colors hover:border-neon/60 focus-visible:ring-1 focus-visible:ring-neon sm:max-w-none"
        aria-label="Tema visual"
        title={theme.description}
      >
        {THEMES.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
      <span className="hidden items-center gap-0.5 sm:flex" aria-label={`${theme.name} palette preview`}>
        {[theme.primary, theme.secondary, theme.success].map((color) => (
          <span key={color} className="size-1.5 rounded-full" style={{ backgroundColor: color }} />
        ))}
      </span>
    </div>
  )
}
