import { useEffect, useState } from 'react'
import { logFailure } from '../lib/logFailure'
import { descriviMancanti, episodiMancanti, leggiStagioniInCache, stagioniSerie, totaleMancanti, type StagioneTmdb } from '../lib/stagioniTmdb'
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
  // Aperta o chiusa la può decidere la pagina: una serie riconosciuta mentre
  // la si guarda cambia identità, e con lo stato qui dentro si richiudeva.
  aperta?: boolean
  onAperta?: (aperta: boolean) => void
  // «Scegli il titolo» per tutta la serie: quando Ciak non l'ha riconosciuta,
  // o ha sbagliato.
  riconosciuta?: boolean
  onScegliTitolo?: () => void
  // L'id TMDB della serie: con quello si chiede quanti episodi ha davvero
  // ogni stagione, e i mancanti su Drive si vedono in grigio al loro posto.
  tmdbId?: number | null
  // Tutta la serie nel cestino di Drive (la pagina chiede conferma).
  onCancella?: () => void
  cancellando?: boolean
  // Un file fra gli «Altri episodi» che forse non è un episodio (il film della
  // serie, un extra): gli si sceglie il titolo da solo, senza toccare la serie.
  onScegliFile?: (episodio: EpisodioVideoteca) => void
}

// La stagione 0 sono gli speciali (OAD, OVA), come su TMDB.
function nomeStagione(stagione: number | null): string {
  if (stagione === null) return 'Altri episodi'
  return stagione === 0 ? 'Speciali' : `Stagione ${stagione}`
}

function avanzamento(e: EpisodioVideoteca): number {
  return e.durata ? Math.min(1, e.posizione / e.durata) : 0
}

export default function SerieVideoteca({
  titolo,
  poster,
  anno,
  episodi,
  scaricati,
  onApri,
  aperta: apertaFuori,
  onAperta,
  riconosciuta = false,
  onScegliTitolo,
  tmdbId = null,
  onCancella,
  cancellando = false,
  onScegliFile,
}: Props) {
  const [apertaQui, setApertaQui] = useState(false)
  const aperta = apertaFuori ?? apertaQui
  // Dalla cache subito (anche a serie chiusa, per dire quanti mancano); da
  // TMDB la prima volta che la si apre.
  const [stagioniTmdb, setStagioniTmdb] = useState<StagioneTmdb[] | null>(() => (tmdbId !== null ? leggiStagioniInCache(tmdbId) : null))
  useEffect(() => {
    if (!aperta || tmdbId === null || stagioniTmdb) return
    let vivo = true
    stagioniSerie(tmdbId)
      .then((s) => vivo && setStagioniTmdb(s))
      .catch(logFailure('Episodi delle stagioni da TMDB'))
    return () => {
      vivo = false
    }
  }, [aperta, tmdbId, stagioniTmdb])
  const buchi = stagioniTmdb ? episodiMancanti(episodi, stagioniTmdb) : []
  const bucoDi = new Map(buchi.map((b) => [b.stagione, b]))
  const mancanti = totaleMancanti(buchi)
  const stagioniAssenti = buchi.filter((b) => b.suDrive === 0)
  const setAperta = (cambia: (a: boolean) => boolean) => {
    const nuova = cambia(aperta)
    setApertaQui(nuova)
    onAperta?.(nuova)
  }
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
              {mancanti > 0 && ` · ${mancanti} non su Drive`}
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
            const buco = s.stagione !== null ? bucoDi.get(s.stagione) : undefined
            // I file e, al loro posto, i numeri che mancano: in ordine di episodio.
            const righe: ({ tipo: 'file'; e: EpisodioVideoteca } | { tipo: 'manca'; n: number })[] = [
              ...s.episodi.map((e) => ({ tipo: 'file' as const, e })),
              ...(buco?.mancanti ?? []).map((n) => ({ tipo: 'manca' as const, n })),
            ].sort((a, b) => {
              const na = a.tipo === 'file' ? (a.e.episodio ?? Infinity) : a.n
              const nb = b.tipo === 'file' ? (b.e.episodio ?? Infinity) : b.n
              return na - nb
            })
            return (
              <section key={s.stagione ?? 'altro'} className="pt-3">
                <h3 className="mb-1 flex items-baseline gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  {nomeStagione(s.stagione)}
                  <span className="font-normal normal-case tracking-normal text-zinc-600">
                    {vistiStagione}/{s.episodi.length} visti
                    {buco && buco.mancanti.length > 0 && ` · ${descriviMancanti(buco.mancanti)}`}
                  </span>
                </h3>
                <ul aria-label={nomeStagione(s.stagione)}>
                  {righe.map((riga) => {
                    if (riga.tipo === 'manca') {
                      return (
                        <li key={`manca-${riga.n}`} className="flex items-center gap-3 px-2 py-1.5 text-zinc-600">
                          <span className="w-12 shrink-0 text-xs font-medium">Ep. {riga.n}</span>
                          <span className="min-w-0 flex-1 truncate text-sm italic">non su Drive</span>
                        </li>
                      )
                    }
                    const e = riga.e
                    const iniziato = episodioIniziato(e)
                    return (
                      <li key={e.id} className="flex items-center gap-1">
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
                        {s.stagione === null && onScegliFile && (
                          <button
                            type="button"
                            onClick={() => onScegliFile(e)}
                            aria-label={`Scegli il titolo di ${e.nome}`}
                            title="Non è un episodio? Scegli il titolo"
                            className="shrink-0 rounded-lg px-2 py-1.5 text-xs text-zinc-400 transition hover:text-projector"
                          >
                            ✎
                          </button>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })}
          {stagioniAssenti.length > 0 && (
            <ul aria-label="Stagioni non su Drive" className="pt-3 text-xs text-zinc-600">
              {stagioniAssenti.map((b) => (
                <li key={b.stagione} className="px-2 py-1">
                  {nomeStagione(b.stagione)} · {b.totale === 1 ? '1 episodio' : `${b.totale} episodi`}, nessuno su Drive
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
            {onScegliTitolo && (
              <button type="button" onClick={onScegliTitolo} className="text-xs text-zinc-400 transition hover:text-projector">
                ✎ {riconosciuta ? 'Non è questa serie? Scegli il titolo' : 'Scegli il titolo della serie'}
              </button>
            )}
            {/* Solo a serie aperta: chiusa, un clic per sbaglio costerebbe troppo. */}
            {onCancella && (
              <button type="button" onClick={onCancella} disabled={cancellando} className="text-xs text-zinc-500 transition hover:text-red-400">
                {cancellando ? 'Cancello…' : '🗑 Cancella la serie da Drive'}
              </button>
            )}
          </div>
        </div>
      )}
    </>
  )
}
