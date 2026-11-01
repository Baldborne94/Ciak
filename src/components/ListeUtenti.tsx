import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getListeConTitolo, posterUrl, type ListaUtente } from '../lib/tmdb'
import { logFailure } from '../lib/logFailure'
import type { TmdbType } from '../lib/types'

// Le liste pubbliche degli utenti di TMDB che contengono questo titolo: un
// modo per trovare titoli affini scelti da persone, non da un algoritmo. Ogni
// lista si apre in Ciak (ListaTmdbPage), coi badge di ciò che si è già visto.

const PRIME = 6

export default function ListeUtenti({ type, id }: { type: TmdbType; id: number }) {
  const [liste, setListe] = useState<ListaUtente[] | null>(null)
  const [tutte, setTutte] = useState(false)

  useEffect(() => {
    let vivo = true
    setListe(null)
    setTutte(false)
    getListeConTitolo(type, id)
      .then((l) => vivo && setListe(l))
      .catch(logFailure('Liste degli utenti da TMDB'))
    return () => {
      vivo = false
    }
  }, [type, id])

  // Una sezione in più, non essenziale: senza liste (o senza rete) non c'è.
  if (!liste || liste.length === 0) return null
  const mostrate = tutte ? liste : liste.slice(0, PRIME)

  return (
    <section>
      <h2 className="mb-4 font-display text-2xl tracking-wide text-zinc-100">📋 Nelle liste degli utenti</h2>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {mostrate.map((l) => {
          const poster = posterUrl(l.posterPath, 'w185')
          return (
            <li key={l.id}>
              <Link
                to={`/lista-tmdb/${l.id}`}
                className="flex h-full gap-3 rounded-xl border border-theatre-800 bg-theatre-900/40 p-3 transition hover:border-projector/50"
              >
                {poster ? (
                  <img src={poster} alt="" loading="lazy" className="h-20 w-14 shrink-0 rounded object-cover" />
                ) : (
                  <span className="flex h-20 w-14 shrink-0 items-center justify-center rounded bg-theatre-800 text-xl opacity-40">📋</span>
                )}
                <span className="min-w-0">
                  <span className="line-clamp-2 text-sm font-medium text-zinc-100">{l.nome}</span>
                  <span className="mt-0.5 block text-xs text-zinc-500">
                    {l.quanti} titoli{l.preferiti > 0 && ` · ♥ ${l.preferiti}`}
                  </span>
                  {l.descrizione && <span className="mt-1 line-clamp-2 text-xs text-zinc-400">{l.descrizione}</span>}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
      {!tutte && liste.length > PRIME && (
        <button type="button" onClick={() => setTutte(true)} className="btn-ghost mt-3 px-3 py-1.5 text-sm">
          Mostra tutte le liste ({liste.length})
        </button>
      )}
    </section>
  )
}
