import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import StarRating from './StarRating'
import { posterUrl, searchMulti } from '../lib/tmdb'
import { logFailure } from '../lib/logFailure'
import { formattaTempo, titoloDaMostrare, type VoceStreaming } from '../lib/streaming'
import type { NomeFilm } from '../lib/sottotitoli'
import type { Visto } from '../lib/useArchivioStreaming'
import type { MediaItem } from '../lib/types'

// Sotto il lettore: quale titolo è questo file (e come correggerlo), da dove
// si è ripreso, e — a fine film — «visto», il voto e l'episodio successivo.
export default function PannelloArchivio({
  voce,
  nome,
  ripresoDa,
  visto,
  votoSalvato,
  errore,
  prossimo,
  onRicomincia,
  onVota,
  onCambia,
}: {
  voce: VoceStreaming | null
  nome: NomeFilm
  ripresoDa: number | null
  visto: Visto | null
  votoSalvato: number | null
  errore: string | null
  prossimo: VoceStreaming | null
  onRicomincia: () => void
  onVota: (voto: number | null) => void
  onCambia: (item: MediaItem, nome: NomeFilm) => Promise<void>
}) {
  const navigate = useNavigate()
  const [scegliendo, setScegliendo] = useState(false)
  const [ricerca, setRicerca] = useState(nome.titolo)
  const [risultati, setRisultati] = useState<MediaItem[] | null>(null)
  const [cercando, setCercando] = useState(false)
  const [stagione, setStagione] = useState(nome.stagione ?? 1)
  const [episodio, setEpisodio] = useState(nome.episodio ?? 1)

  const abbinato = !!voce?.tmdb_id && !!voce.titolo
  const linkScheda =
    voce?.tmdb_id && voce.media_type
      ? `/title/${voce.media_type}/${voce.tmdb_id}${
          voce.media_type === 'tv' && voce.stagione != null ? `?season=${voce.stagione}&episode=${voce.episodio}` : ''
        }`
      : null

  async function cerca() {
    setCercando(true)
    try {
      setRisultati((await searchMulti(ricerca)).slice(0, 8))
    } catch (e) {
      logFailure('Ricerca del titolo per il film di Drive')(e)
      setRisultati([])
    } finally {
      setCercando(false)
    }
  }

  async function scegli(item: MediaItem) {
    const scelto: NomeFilm =
      item.mediaType === 'tv' ? { titolo: nome.titolo, stagione, episodio } : { titolo: nome.titolo, anno: nome.anno }
    await onCambia(item, scelto).catch(logFailure('Abbinamento scelto a mano non salvato'))
    setScegliendo(false)
    setRisultati(null)
  }

  const prossimoPulsante = prossimo && (
    <button
      type="button"
      onClick={() =>
        navigate(`/streaming/${prossimo.drive_file_id}`, {
          state: { titolo: titoloDaMostrare(prossimo) ?? undefined, file: prossimo.nome_file ?? undefined },
        })
      }
      className="btn-primary px-3 py-1.5"
    >
      ▶ Prossimo episodio: S{prossimo.stagione}E{prossimo.episodio}
    </button>
  )

  return (
    <div className="space-y-3">
      {visto && (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl border border-projector/40 bg-projector/10 p-4 text-sm text-zinc-200">
          {visto.tipo === 'film' && (
            <>
              <p className="flex-1">✓ Segnato come visto nel diario, oggi. Che voto gli dai?</p>
              <StarRating value={votoSalvato} onChange={onVota} />
            </>
          )}
          {visto.tipo === 'episodio' && (
            <>
              <p className="flex-1">
                ✓ Episodio S{voce?.stagione}E{voce?.episodio} spuntato: {voce?.titolo} è in corso.
              </p>
              {prossimoPulsante}
            </>
          )}
          {visto.tipo === 'serie' && (
            <>
              <p className="flex-1">✓ Hai finito {voce?.titolo}! Che voto dai alla serie?</p>
              <StarRating value={votoSalvato} onChange={onVota} />
            </>
          )}
          {votoSalvato != null && <p className="w-full text-xs text-zinc-400">Voto salvato.</p>}
        </div>
      )}
      {errore && <p className="text-sm text-red-400">{errore}</p>}

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-theatre-800 bg-theatre-900/40 p-3 text-sm">
        {abbinato && voce?.poster_path && (
          <img src={posterUrl(voce.poster_path, 'w185') ?? undefined} alt="" className="h-16 w-11 rounded object-cover" />
        )}
        <div className="min-w-0 flex-1">
          {abbinato ? (
            <p className="text-zinc-200">
              🎬{' '}
              {linkScheda ? (
                <Link to={linkScheda} className="font-medium hover:text-projector">
                  {titoloDaMostrare(voce as VoceStreaming)}
                </Link>
              ) : (
                titoloDaMostrare(voce as VoceStreaming)
              )}
              {voce?.visto_il && !visto && <span className="text-zinc-500"> · già visto</span>}
            </p>
          ) : (
            <p className="text-zinc-400">
              Non so ancora che titolo è: sceglilo, così a fine visione lo segno come visto.
            </p>
          )}
          {ripresoDa != null && (
            <p className="mt-1 text-xs text-zinc-400">
              Ripreso da {formattaTempo(ripresoDa)} ·{' '}
              <button type="button" onClick={onRicomincia} className="text-projector hover:underline">
                Ricomincia dall'inizio
              </button>
            </p>
          )}
        </div>
        {!visto && prossimoPulsante}
        <button type="button" onClick={() => setScegliendo((s) => !s)} className="btn-ghost px-3 py-1.5">
          {abbinato ? 'Non è questo?' : 'Scegli il titolo'}
        </button>
      </div>

      {scegliendo && (
        <div className="space-y-3 rounded-xl border border-theatre-800 bg-theatre-900/40 p-3 text-sm">
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              void cerca()
            }}
          >
            <label className="sr-only" htmlFor="cerca-titolo-drive">
              Titolo da cercare
            </label>
            <input
              id="cerca-titolo-drive"
              value={ricerca}
              onChange={(e) => setRicerca(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-theatre-700 bg-theatre-950 px-3 py-1.5 text-zinc-100"
            />
            <button type="submit" disabled={cercando} className="btn-primary px-3 py-1.5">
              {cercando ? 'Cerco…' : 'Cerca'}
            </button>
          </form>
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
            Se è una serie:
            <label>
              stagione{' '}
              <input
                type="number"
                min={0}
                value={stagione}
                onChange={(e) => setStagione(Number(e.target.value))}
                className="w-14 rounded border border-theatre-700 bg-theatre-950 px-1 text-zinc-100"
              />
            </label>
            <label>
              episodio{' '}
              <input
                type="number"
                min={1}
                value={episodio}
                onChange={(e) => setEpisodio(Number(e.target.value))}
                className="w-14 rounded border border-theatre-700 bg-theatre-950 px-1 text-zinc-100"
              />
            </label>
          </div>
          {risultati && risultati.length === 0 && <p className="text-zinc-400">Nessun risultato.</p>}
          {risultati && risultati.length > 0 && (
            <ul className="divide-y divide-theatre-800">
              {risultati.map((r) => (
                <li key={`${r.mediaType}-${r.id}`}>
                  <button
                    type="button"
                    onClick={() => void scegli(r)}
                    className="flex w-full items-center gap-3 py-2 text-left hover:bg-theatre-800/60"
                  >
                    {r.posterPath ? (
                      <img src={posterUrl(r.posterPath, 'w185') ?? undefined} alt="" className="h-12 w-8 rounded object-cover" />
                    ) : (
                      <span className="h-12 w-8 rounded bg-theatre-800" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-zinc-100">{r.title}</span>
                      <span className="block text-xs text-zinc-500">
                        {r.mediaType === 'tv' ? 'Serie' : 'Film'}
                        {r.releaseDate ? ` · ${r.releaseDate.slice(0, 4)}` : ''}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
