import { Link } from 'react-router-dom'
import { logoUrl } from '../lib/tmdb'
import type { Company } from '../lib/types'

// Uno studio nei risultati della ricerca. Il numero dei film compare solo fra
// omonimi (vedi ordinaOmonimi): due «A24» col logo uguale, senza, sarebbero
// indistinguibili.
export default function StudioCard({ c }: { c: Company }) {
  const logo = logoUrl(c.logoPath)
  return (
    <Link
      to={`/studio/${c.id}`}
      className="group flex h-32 flex-col items-center justify-center gap-3 rounded-xl border border-theatre-800 bg-theatre-900 p-4 text-center transition hover:-translate-y-1 hover:border-projector/40"
    >
      {logo ? (
        <img src={logo} alt={c.name} loading="lazy" className="max-h-14 max-w-[80%] rounded bg-white/90 px-3 py-2" />
      ) : (
        <span className="text-4xl opacity-40">🏛️</span>
      )}
      <p className="line-clamp-1 text-sm font-medium text-zinc-200">{c.name}</p>
      {c.film !== undefined && <p className="-mt-2 text-xs text-zinc-500">{c.film === 1 ? '1 film' : `${c.film} film`}</p>}
    </Link>
  )
}
