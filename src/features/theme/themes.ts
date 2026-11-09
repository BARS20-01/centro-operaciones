export type ThemeId = 'nexus' | 'altair' | 'obsidian' | 'helix' | 'unab'

export interface ThemeTokens {
  background: string
  surface: string
  primary: string
  secondary: string
  success: string
  warning: string
  error: string
  glow: string
  connection: string
}

export interface ThemeDefinition extends ThemeTokens {
  id: ThemeId
  name: string
  description: string
}

export const THEMES: ThemeDefinition[] = [
  {
    id: 'nexus',
    name: 'NEXUS',
    description: 'Cyber Operations Center',
    background: '#05070d',
    surface: '#0a1020',
    primary: '#22d3ee',
    secondary: '#3b82f6',
    success: '#34d399',
    warning: '#fbbf24',
    error: '#fb7185',
    glow: '#22d3ee',
    connection: '#16314a',
  },
  {
    id: 'altair',
    name: 'ALTAIR',
    description: 'AI Operations · Knowledge Graphs',
    background: '#100e18',
    surface: '#1b1725',
    primary: '#f97316',
    secondary: '#e879f9',
    success: '#2dd4bf',
    warning: '#fb923c',
    error: '#c084fc',
    glow: '#f97316',
    connection: '#49304b',
  },
  {
    id: 'obsidian',
    name: 'OBSIDIAN',
    description: 'Knowledge Management · Second Brain',
    background: '#101113',
    surface: '#1b1b20',
    primary: '#fbbf24',
    secondary: '#a78bfa',
    success: '#2dd4bf',
    warning: '#f59e0b',
    error: '#fb7185',
    glow: '#fbbf24',
    connection: '#48434b',
  },
  {
    id: 'helix',
    name: 'HELIX',
    description: 'AI · Digital Twin · Infrastructure Intelligence',
    background: '#071211',
    surface: '#0d1f1d',
    primary: '#a3e635',
    secondary: '#2dd4bf',
    success: '#4ade80',
    warning: '#fbbf24',
    error: '#fb7185',
    glow: '#84cc16',
    connection: '#254c42',
  },
  {
    id: 'unab',
    name: 'UNAB',
    description: 'Identidad institucional',
    background: '#101827',
    surface: '#1c293b',
    primary: '#2563eb',
    secondary: '#93c5fd',
    success: '#15803d',
    warning: '#ca8a04',
    error: '#b91c1c',
    glow: '#60a5fa',
    connection: '#475569',
  },
]

export function isThemeId(value: string | null): value is ThemeId {
  return THEMES.some((theme) => theme.id === value)
}
