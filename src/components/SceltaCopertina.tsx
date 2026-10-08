import { useEffect, useRef, useState } from 'react'
import { backdropUrl, getImmaginiTitolo, posterUrl } from '../lib/tmdb'
import { linkCopertinaValido } from '../lib/raccolte'
import { mapLimit } from '../lib/mapLimit'
import { logFailure } from '../lib/logFailure'
import type { TmdbType } from '../lib/types'

// La copertina di una raccolta: gli sfondi e le locandine dei suoi titoli da
// TMDB (i primi otto titoli: oltre, la scelta diventa una pagina infinita), un
// link a un'immagine trovata altrove, o di nuovo il mosaico automatico.
const MAX_TITOLI = 8

interface Immagini {
  titolo: string
  sfondi: string[]
  locandine: string[]
}

export default function SceltaCopertina({
  titoli,
  attuale,
  onScegli,
}: {
  titoli: { tmdbId: number; mediaType: TmdbType; titolo: string }[]
  attuale: string | null
  onScegli: (copertina: string | null) => void
}) {
  const [immagini, setImmagini] = useState<Immagini[] | null>(null)
  const [link, setLink] = useState('')
  const [linkErrato, setLinkErrato] = useState(false)

  // La pagina ricrea l'elenco a ogni disegno: si richiede a TMDB solo quando
  // cambiano davvero i titoli, non a ogni aggiornamento.
  const chiave = titoli.map((t) => `${t.mediaType}-${t.tmdbId}`).join(',')
  const titoliRef = useRef(titoli)
  titoliRef.current = titoli
  useEffect(() => {
    let vivo = true
    let falliti = 0
    mapLimit(titoliRef.current.slice(0, MAX_TITOLI), 4, async (t) => {
      try {
        return { titolo: t.titolo, ...(await getImmaginiTitolo(t.mediaType, t.tmdbId)) }
      } catch {
        falliti++
        return { titolo: t.titolo, sfondi: [], locandine: [] }
      }
    }).then((tutte) => {
      if (falliti > 0) logFailure('Immagini per la copertina della raccolta')(new Error(`${falliti} titoli su ${tutte.length} senza immagini`))
      if (vivo) setImmagini(tutte.filter((i) => i.sfondi.length + i.locandine.length > 0))
    })
    return () => {
      vivo = false
    }
  }, [chiave])

  function usaLink() {
    const valido = linkCopertinaValido(link)
    setLinkErrato(!valido)
    if (valido) onScegli(valido)
  }

  const scelta = (percorso: string) => (percorso === attuale ? 'ring-2 ring-projector' : 'hover:ring-2 hover:ring-projector/60')

  return (
    <div className="space-y-4">
      {immagini === null ? (
        <p className="text-sm text-zinc-400">Cerco le immagini dei titoli…</p>
      ) : immagini.length === 0 ? (
        <p className="text-sm text-zinc-400">TMDB non ha immagini per questi titoli: incolla il link di un’immagine qui sotto.</p>
      ) : (
        immagini.map((t) => (
          <section key={t.titolo}>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">{t.titolo}</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {t.sfondi.map((p, i) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => onScegli(p)}
                  aria-label={`Sfondo ${i + 1} di «${t.titolo}»`}
                  className={`aspect-video overflow-hidden rounded-lg ${scelta(p)}`}
                >
                  <img src={backdropUrl(p, 'w300') ?? undefined} alt="" loading="lazy" className="h-full w-full object-cover" />
                </button>
              ))}
              {t.locandine.map((p, i) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => onScegli(p)}
                  aria-label={`Locandina ${i + 1} di «${t.titolo}»`}
                  className={`aspect-video overflow-hidden rounded-lg bg-theatre-900 ${scelta(p)}`}
                >
                  <img src={posterUrl(p, 'w185') ?? undefined} alt="" loading="lazy" className="mx-auto h-full object-contain" />
                </button>
              ))}
            </div>
          </section>
        ))
      )}

      <div className="space-y-1 border-t border-theatre-800 pt-3">
        <label htmlFor="link-copertina" className="block text-xs uppercase tracking-wider text-zinc-500">
          Link di un’immagine
        </label>
        <div className="flex gap-2">
          <input
            id="link-copertina"
            type="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://…"
            className="input-cine flex-1"
          />
          <button type="button" onClick={usaLink} className="btn-ghost px-3 py-1.5">
            Usa questo link
          </button>
        </div>
        {linkErrato && <p className="text-xs text-red-400">Per usarlo serve un link che comincia con https:// (copialo con «Copia indirizzo immagine»).</p>}
      </div>

      <button type="button" onClick={() => onScegli(null)} className="text-xs text-zinc-400 transition hover:text-projector">
        Usa il mosaico delle locandine
      </button>
    </div>
  )
}
