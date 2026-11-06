import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4">
      <h2 className="font-display text-5xl text-neon glow-text">404</h2>
      <p className="text-slate-400">Señal perdida: la ruta no existe.</p>
      <Link to="/" className="rounded border border-neon/50 px-4 py-1 text-neon hover:bg-neon/10">
        Volver al Dashboard
      </Link>
    </div>
  )
}
