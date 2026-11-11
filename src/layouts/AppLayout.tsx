import { Link, Outlet } from 'react-router-dom'
import { Radar } from 'lucide-react'
import { useEffect, useState } from 'react'
import { AmbientBackground } from '@/features/ambient/AmbientBackground'
import { ThemeSwitcher } from '@/features/theme/ThemeSwitcher'
import { WorkspaceSwitcher } from '@/workspaces/WorkspaceSwitcher'

function Clock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return <time className="tabular-nums text-neon">{now.toLocaleTimeString('es', { hour12: false })}</time>
}

export function AppLayout() {
  return (
    <div className="scanlines relative flex h-dvh flex-col overflow-hidden">
      <AmbientBackground />
      <header className="relative z-30 flex flex-wrap items-center justify-between gap-2 border-b border-neon/20 bg-void/60 px-4 py-1.5 backdrop-blur">
        <Link to="/" className="flex items-center gap-2">
          <Radar className="size-5 text-neon" />
          <div className="flex flex-col leading-tight">
            <h1 className="font-display text-sm font-bold uppercase tracking-[0.3em] text-slate-100 glow-text sm:text-base">
              Nexus Prime
            </h1>
            <span className="text-[9px] uppercase tracking-[0.25em] text-neon/70">Engineering Operations Nexus</span>
          </div>
        </Link>
        <div className="flex items-center gap-2 text-xs sm:gap-4">
          <WorkspaceSwitcher />
          <ThemeSwitcher />
          <span className="hidden items-center gap-1 text-ok sm:flex">
            <span className="size-2 animate-pulse rounded-full bg-ok" style={{ boxShadow: '0 0 8px var(--theme-success)' }} />
            SISTEMA OPERATIVO
          </span>
          <span className="hidden sm:inline"><Clock /></span>
        </div>
      </header>
      <main className="relative z-10 min-h-0 flex-1">
        <Outlet />
      </main>
    </div>
  )
}
