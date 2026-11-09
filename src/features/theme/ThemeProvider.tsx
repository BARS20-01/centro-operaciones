import { useCallback, useLayoutEffect, useMemo, useState, type ReactNode } from 'react'
import { ThemeContext } from './theme-context'
import { isThemeId, THEMES, type ThemeId, type ThemeTokens } from './themes'

const STORAGE_KEY = 'nexus-prime-theme'
const CSS_TOKENS: Record<keyof ThemeTokens, `--theme-${string}`> = {
  background: '--theme-background',
  surface: '--theme-surface',
  primary: '--theme-primary',
  secondary: '--theme-secondary',
  success: '--theme-success',
  warning: '--theme-warning',
  error: '--theme-error',
  glow: '--theme-glow',
  connection: '--theme-connection',
}

function readStoredTheme(): ThemeId {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return isThemeId(stored) ? stored : 'nexus'
  } catch (error) {
    console.error('Unable to read the saved visual theme:', error)
    return 'nexus'
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeId] = useState<ThemeId>(readStoredTheme)
  const theme = THEMES.find((candidate) => candidate.id === themeId) ?? THEMES[0]

  const setTheme = useCallback((id: ThemeId) => {
    setThemeId(id)
  }, [])

  useLayoutEffect(() => {
    const root = document.documentElement
    root.dataset.theme = theme.id
    for (const [token, property] of Object.entries(CSS_TOKENS) as [keyof ThemeTokens, string][]) {
      root.style.setProperty(property, theme[token])
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, theme.id)
    } catch (error) {
      console.error('Unable to persist the selected visual theme:', error)
    }
    window.dispatchEvent(new Event('nexus-theme-change'))
  }, [theme])

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
