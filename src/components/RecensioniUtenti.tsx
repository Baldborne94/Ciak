import { useEffect, useState } from 'react'
import { getRecensioni, type Recensione } from '../lib/tmdb'
import { logFailure } from '../lib/logFailure'
import type { TmdbType } from '../lib/types'

// Le recensioni degli spettatori nella scheda di un titolo, da TMDB (Letterboxd
// non ha un'API pubblica). Sono quasi tutte in inglese e spesso lunghe: se ne
// mostrano poche, ognuna tagliata, e il resto si apre a richiesta.

const PRIME = 3
const TAGLIO = 500

const LINGUE: Record<string, string> = { it: 'italiano', en: 'inglese', es: 'spagnolo', fr: 'francese', de: 'tedesco', pt: 'portoghese' }

function data(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })
}

function Voce({ r }: { r: Recensione }) {
  const [aperta, setAperta] = useState(false)
  const lunga = r.testo.length > TAGLIO
  // Il taglio cade su uno spazio, non a metà parola.
  const corto = lunga ? `${r.testo.slice(0, r.testo.lastIndexOf(' ', TAGLIO) > 0 ? r.testo.lastIndexOf(' ', TAGLIO) : TAGLIO)}…` : r.testo
  return (
    <li className="rounded-xl border border-theatre-800 bg-theatre-900/40 p-4">
      <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
        <span className="font-medium text-zinc-100">{r.autore}</span>
        {r.voto !== null && <span className="text-projector">★ {r.voto}/10</span>}
        <span className="text-xs text-zinc-500">
          {data(r.data)}
          {r.lingua && r.lingua !== 'it' && ` · in ${LINGUE[r.lingua] ?? r.lingua}`}
        </span>
      </p>
      <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-zinc-300">{aperta ? r.testo : corto}</p>
      <div className="mt-2 flex gap-4 text-xs">
        {lunga && (
          <button type="button" onClick={() => setAperta(!aperta)} aria-expanded={aperta} className="text-projector/80 hover:text-projector">
            {aperta ? 'Riduci' : 'Leggi tutta'}
          </button>
        )}
        <a href={r.url} target="_blank" rel="noreferrer" className="text-zinc-500 hover:text-zinc-300">
          Su TMDB ↗
        </a>
      </div>
    </li>
  )
}

export default function RecensioniUtenti({ type, id }: { type: TmdbType; id: number }) {
  const [recensioni, setRecensioni] = useState<Recensione[] | null>(null)
  const [errore, setErrore] = useState(false)
  const [tutte, setTutte] = useState(false)

  useEffect(() => {
    let vivo = true
    setRecensioni(null)
    setErrore(false)
    setTutte(false)
    getRecensioni(type, id)
      .then((r) => vivo && setRecensioni(r))
      .catch((e) => {
        logFailure('Recensioni degli utenti da TMDB')(e)
        if (vivo) setErrore(true)
      })
    return () => {
      vivo = false
    }
  }, [type, id])

  // Mentre arrivano non si mostra niente: è una sezione in fondo alla scheda.
  if (!recensioni && !errore) return null
  const mostrate = tutte ? (recensioni ?? []) : (recensioni ?? []).slice(0, PRIME)

  return (
    <section>
      <h2 className="mb-4 font-display text-2xl tracking-wide text-zinc-100">💬 Recensioni degli utenti</h2>
      {errore ? (
        <p className="text-sm text-zinc-500">Le recensioni di TMDB non rispondono, ora. Riprova più tardi.</p>
      ) : mostrate.length === 0 ? (
        <p className="text-sm text-zinc-500">Ancora nessuna recensione su TMDB per questo titolo.</p>
      ) : (
        <>
          <ul className="space-y-3">
            {mostrate.map((r) => (
              <Voce key={r.id} r={r} />
            ))}
          </ul>
          {!tutte && (recensioni?.length ?? 0) > PRIME && (
            <button type="button" onClick={() => setTutte(true)} className="btn-ghost mt-3 px-3 py-1.5 text-sm">
              Mostra tutte le recensioni ({recensioni?.length})
            </button>
          )}
        </>
      )}
    </section>
  )
}
