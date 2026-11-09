import { createContext, useContext } from 'react'
import type { ThemeDefinition, ThemeId } from './themes'

export interface ThemeContextValue {
  theme: ThemeDefinition
  setTheme: (id: ThemeId) => void
}

export const ThemeContext = createContext<ThemeContextValue | null>(null)

export function useTheme() {
  const value = useContext(ThemeContext)
  if (!value) throw new Error('useTheme must be used within ThemeProvider')
  return value
}
