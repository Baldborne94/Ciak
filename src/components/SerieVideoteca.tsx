import { useState } from 'react'
import {
  episodioIniziato,
  perStagione,
  prossimoDaGuardare,
  sigla,
  type EpisodioVideoteca,
} from '../lib/videoteca'

// Una serie della videoteca: una riga sola con la locandina, quanti episodi ci
// sono e quanti ne hai visti, e «▶ Continua» per partire dal prossimo. Aperta,
// mostra gli episodi divisi per stagione.

interface Props {
  titolo: string
  poster: string | null
  anno: string | null
  episodi: EpisodioVideoteca[]
  scaricati: Set<string>
  onApri: (episodio: EpisodioVideoteca) => void
}

// La stagione 0 sono gli speciali (OAD, OVA), come su TMDB.
function nomeStagione(stagione: number | null): string {
  if (stagione === null) return 'Altri episodi'
  return stagione === 0 ? 'Speciali' : `Stagione ${stagione}`
}

function avanzamento(e: EpisodioVideoteca): number {
  return e.durata ? Math.min(1, e.posizione / e.durata) : 0
}

export default function SerieVideoteca({ titolo, poster, anno, episodi, scaricati, onApri }: Props) {
  const [aperta, setAperta] = useState(false)
  const visti = episodi.filter((e) => e.visto).length
  const prossimo = prossimoDaGuardare(episodi)
  const stagioni = perStagione(episodi)
  const etichettaProssimo = prossimo
    ? `▶ ${episodioIniziato(prossimo) ? 'Riprendi' : visti > 0 ? 'Continua' : 'Inizia'}${sigla(prossimo) ? ` ${sigla(prossimo)}` : ''}`
    : null
  const idElenco = `episodi-${titolo.replace(/\W+/g, '-')}`

  return (
    <>
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setAperta((a) => !a)}
          aria-expanded={aperta}
          aria-controls={idElenco}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          {poster ? (
            <img src={poster} alt="" loading="lazy" className="h-14 w-10 shrink-0 rounded object-cover" />
          ) : (
            <span aria-hidden="true" className="flex h-14 w-10 shrink-0 items-center justify-center text-xl">
              📺
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-zinc-100">
              {titolo} <span className="text-zinc-500">{aperta ? '▾' : '▸'}</span>
            </span>
            <span className="block truncate text-xs text-zinc-500">
              {anno && `${anno} · `}
              {episodi.length === 1 ? '1 episodio' : `${episodi.length} episodi`}
              {stagioni.length > 1 && ` in ${stagioni.length} stagioni`}
              {visti > 0 && ` · ${visti === episodi.length ? 'tutti visti' : `${visti} visti`}`}
            </span>
            {visti > 0 && visti < episodi.length && (
              <span className="mt-1 block h-1 overflow-hidden rounded bg-theatre-800" aria-hidden="true">
                <span className="block h-full bg-projector" style={{ width: `${Math.round((visti / episodi.length) * 100)}%` }} />
              </span>
            )}
          </span>
        </button>
        {prossimo && etichettaProssimo ? (
          <button type="button" onClick={() => onApri(prossimo)} className="shrink-0 text-projector">
            {etichettaProssimo}
          </button>
        ) : (
          <span className="shrink-0 text-sm text-zinc-500">✓ Vista</span>
        )}
      </div>

      {aperta && (
        <div id={idElenco} className="border-t border-theatre-800 bg-theatre-950/40 px-4 pb-3">
          {stagioni.map((s) => {
            const vistiStagione = s.episodi.filter((e) => e.visto).length
            return (
              <section key={s.stagione ?? 'altro'} className="pt-3">
                <h3 className="mb-1 flex items-baseline gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  {nomeStagione(s.stagione)}
                  <span className="font-normal normal-case tracking-normal text-zinc-600">
                    {vistiStagione}/{s.episodi.length} visti
                  </span>
                </h3>
                <ul aria-label={nomeStagione(s.stagione)}>
                  {s.episodi.map((e) => {
                    const iniziato = episodioIniziato(e)
                    return (
                      <li key={e.id}>
                        <button
                          type="button"
                          onClick={() => onApri(e)}
                          className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition hover:bg-theatre-800/60"
                        >
                          <span className="w-12 shrink-0 text-xs font-medium text-zinc-400">
                            {e.episodio !== null ? `Ep. ${e.episodio}` : '—'}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className={`block truncate text-sm ${e.visto ? 'text-zinc-500' : 'text-zinc-200'}`}>
                              {e.visto && '✓ '}
                              {scaricati.has(e.id) && '📱 '}
                              {e.nome}
                            </span>
                            {iniziato && (
                              <span className="mt-1 block h-0.5 overflow-hidden rounded bg-theatre-800" aria-hidden="true">
                                <span className="block h-full bg-projector" style={{ width: `${Math.round(avanzamento(e) * 100)}%` }} />
                              </span>
                            )}
                          </span>
                          <span className="shrink-0 text-xs text-projector">{iniziato ? '▶ Riprendi' : '▶'}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })}
        </div>
      )}
    </>
  )
}
