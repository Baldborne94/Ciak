import { useEffect, useState } from 'react'
import { scaricaPremiDelTitolo, type PremioVinto } from '../lib/premi'
import { logFailure } from '../lib/logFailure'
import type { TmdbType } from '../lib/types'

// I premi vinti da un titolo, nella sua scheda: Oscar, festival, e chi li ha
// vinti (miglior attore non protagonista a…, fotografia a…). Da Wikidata, come
// la pagina dei premi. I premi maggiori prima: Wikidata registra anche decine
// di premi della critica locale, che si aprono a richiesta.

const PRIMI = 8

// In memoria per la visita: riaprire una scheda non richiede di nuovo.
const giaLetti = new Map<string, PremioVinto[]>()

export default function PremiVinti({ type, id }: { type: TmdbType; id: number }) {
  const chiave = `${type}-${id}`
  const [premi, setPremi] = useState<PremioVinto[] | null>(giaLetti.get(chiave) ?? null)
  const [tutti, setTutti] = useState(false)

  useEffect(() => {
    setTutti(false)
    const letti = giaLetti.get(chiave)
    if (letti) {
      setPremi(letti)
      return
    }
    setPremi(null)
    let vivo = true
    scaricaPremiDelTitolo(type, id)
      .then((p) => {
        giaLetti.set(chiave, p)
        if (vivo) setPremi(p)
      })
      // Una sezione in più: se Wikidata non risponde, la scheda resta com'era.
      .catch(logFailure('Premi del titolo da Wikidata'))
    return () => {
      vivo = false
    }
  }, [chiave, type, id])

  if (!premi || premi.length === 0) return null
  const mostrati = tutti ? premi : premi.slice(0, PRIMI)

  return (
    <section>
      <h2 className="mb-4 font-display text-2xl tracking-wide text-zinc-100">🏅 Premi vinti ({premi.length})</h2>
      <ul className="grid gap-2 sm:grid-cols-2">
        {mostrati.map((p) => (
          <li
            key={`${p.premio}-${p.anno}`}
            className={`rounded-lg border p-3 text-sm ${p.maggiore ? 'border-projector/40 bg-projector/5' : 'border-theatre-800 bg-theatre-900/40'}`}
          >
            <p className="font-medium text-zinc-100">
              {p.maggiore && '🏆 '}
              {p.premio}
              {p.anno && <span className="font-normal text-zinc-500"> · {p.anno}</span>}
            </p>
            {p.persone.length > 0 && <p className="mt-0.5 text-xs text-zinc-400">{p.persone.join(', ')}</p>}
          </li>
        ))}
      </ul>
      {!tutti && premi.length > PRIMI && (
        <button type="button" onClick={() => setTutti(true)} className="btn-ghost mt-3 px-3 py-1.5 text-sm">
          Mostra tutti i premi ({premi.length})
        </button>
      )}
      <p className="mt-2 text-xs text-zinc-500">Da Wikidata, l’archivio libero di Wikipedia.</p>
    </section>
  )
}
