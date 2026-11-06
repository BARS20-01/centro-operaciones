import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'

interface P {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  a: number
}

/** Single lightweight canvas for floating dust; pauses when the tab is hidden. */
function Particles({ count = 70 }: { count?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current!
    const ctx = canvas.getContext('2d')!
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let w = 0
    let h = 0
    let raf = 0

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = canvas.clientWidth
      h = canvas.clientHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const ps: P[] = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.15,
      vy: -0.05 - Math.random() * 0.25,
      r: 0.6 + Math.random() * 1.6,
      a: 0.15 + Math.random() * 0.5,
    }))

    const frame = () => {
      ctx.clearRect(0, 0, w, h)
      for (const p of ps) {
        if (!reduced) {
          p.x += p.vx
          p.y += p.vy
          if (p.y < -4) p.y = h + 4
          if (p.x < -4) p.x = w + 4
          if (p.x > w + 4) p.x = -4
        }
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(103, 232, 249, ${p.a})`
        ctx.fill()
      }
      raf = requestAnimationFrame(frame)
    }
    const onVisibility = () => {
      cancelAnimationFrame(raf)
      if (!document.hidden) raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [count])

  return <canvas ref={ref} className="absolute inset-0 size-full" />
}

export function AmbientBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_45%,#0b1a2e_0%,#05070d_70%)]" />
      <div className="grid-drift absolute inset-0" />
      <div className="grid-floor absolute inset-x-0 bottom-0 h-1/2" />

      <motion.div
        className="absolute -left-1/4 top-0 h-2/3 w-3/4 rounded-full bg-cyan-500/10 blur-[120px]"
        animate={{ x: ['0%', '25%', '0%'], opacity: [0.5, 0.9, 0.5] }}
        transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute -right-1/4 bottom-0 h-2/3 w-3/4 rounded-full bg-fuchsia-500/10 blur-[130px]"
        animate={{ x: ['0%', '-25%', '0%'], opacity: [0.4, 0.8, 0.4] }}
        transition={{ duration: 28, repeat: Infinity, ease: 'easeInOut' }}
      />

      <Particles />
      <div className="scan-beam absolute inset-x-0 h-40" />
      <div className="vignette absolute inset-0" />
    </div>
  )
}
