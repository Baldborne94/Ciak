import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <span className="text-6xl">🎬</span>
      <h1 className="font-display text-5xl tracking-wide text-projector">
        Scena non trovata
      </h1>
      <p className="max-w-md text-zinc-400">
        Questa pagina è finita sul pavimento della sala di montaggio. Torniamo in
        sala?
      </p>
      <Link to="/" className="btn-primary">
        ← Torna alla Dashboard
      </Link>
    </div>
  )
}
