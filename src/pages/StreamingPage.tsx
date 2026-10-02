import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import { EmptyState, ErrorState, Loader } from '../components/States'
import { logFailure } from '../lib/logFailure'
import { useAuth } from '../lib/auth'
import { usePersistedState } from '../lib/usePersistedState'
import { getGenres, getReleaseYears, getSearchTitles, getTitleGenres, posterUrl } from '../lib/tmdb'
import { filterSelectClass } from '../components/FilterBar'
import {
  filtraVideoteca,
  generiPresenti,
  ORDINI_VIDEOTECA,
  ordinaVideoteca,
  raggruppaSerie,
  sigla,
  type OrdineVideoteca,
  type RigaVideoteca,
} from '../lib/videoteca'
import SerieVideoteca from '../components/SerieVideoteca'
import { riconosciNuovi } from '../lib/riconoscimento'
import { salvaPresenti } from '../lib/videoPresenti'
import { elencaStreaming, titoloDaMostrare, type VoceStreaming } from '../lib/streaming'
import { ascoltaFilmOffline, elencaFilmOffline, offlineDisponibile, spazio, taglia, type FilmOffline } from '../lib/filmOffline'
import {
  CARTELLA_CIAK,
  driveConfigurato,
  driveConnesso,
  driveDisconnetti,
  collegaDrive,
  erroreRitornoDrive,
  elencaVideo,
  schedeCategorie,
  soloRiproducibili,
  titoloVideo,
  type DriveVideo,
} from '../lib/googleDrive'

// «video/x-matroska» → «MKV»: il sottotipo MIME è poco leggibile.
function formato(mime: string): string {
  const sotto = mime.replace('video/', '')
  if (sotto === 'x-matroska') return 'MKV'
  if (sotto === 'x-msvideo') return 'AVI'
  if (sotto === 'quicktime') return 'MOV'
  return sotto.replace(/^x-/, '').toUpperCase()
}

export default function StreamingPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  // Il legame di ogni file col suo titolo (locandina, «visto», punto di ripresa).
  const [archivio, setArchivio] = useState<Map<string, VoceStreaming>>(new Map())
  const [connesso, setConnesso] = useState(driveConnesso())
  const [video, setVideo] = useState<DriveVideo[]>([])
  const [nascosti, setNascosti] = useState(0)
  // La scheda scelta (una cartella di primo livello), ricordata fra un'apertura
  // e l'altra. '*' = tutto.
  const [scheda, setScheda] = usePersistedState<string>('ciak:videoteca-scheda', '*')
  const [cartellaTrovata, setCartellaTrovata] = useState(true)
  // Ricerca, ordine e genere: l'ordine si ricorda, gli altri due no (riaprendo
  // la videoteca la si vuole vedere tutta).
  const [query, setQuery] = useState('')
  const [ordine, setOrdine] = usePersistedState<OrdineVideoteca>('ciak:videoteca-ordine', 'titolo')
  const [genere, setGenere] = useState<number | null>(null)
  // Le serie aperte, per nome di cartella: la chiave della serie cambia quando
  // viene riconosciuta, e la lista aperta si richiudeva da sola.
  const [serieAperte, setSerieAperte] = useState<Set<string>>(new Set())
  // Anno, generi e titoli originali dei titoli riconosciuti (chiave composta
  // `${tipo}-${id}`), e i nomi italiani dei generi.
  const [infoTitoli, setInfoTitoli] = useState<{
    anni: Map<string, string | null>
    generi: Map<string, number[]>
    titoli: Map<string, string[]>
  }>({ anni: new Map(), generi: new Map(), titoli: new Map() })
  const [nomiGeneri, setNomiGeneri] = useState<Map<number, string>>(new Map())
  const [caricato, setCaricato] = useState(false)
  const [caricando, setCaricando] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  // Un consenso a Drive andato male nell'app installata torna qui da Google:
  // lo si dice invece di riproporre il pulsante come se niente fosse.
  useEffect(() => {
    const e = erroreRitornoDrive()
    if (e) setErrore(e)
  }, [])
  // I film sul dispositivo: si vedono anche senza rete, ed è il motivo per cui
  // esistono. Si controlla `onLine` prima di tentare Drive: aspettare un
  // timeout offline vuol dire fissare una pagina vuota per secondi.
  const [offline, setOffline] = useState<FilmOffline[]>([])
  const [senzaRete, setSenzaRete] = useState(typeof navigator !== 'undefined' && !navigator.onLine)
  const [spazioUsato, setSpazioUsato] = useState<number | null>(null)

  const caricaOffline = useCallback(async () => {
    if (!offlineDisponibile()) return
    setOffline(await elencaFilmOffline())
    setSpazioUsato((await spazio())?.usato ?? null)
  }, [])
  useEffect(() => {
    void caricaOffline()
    return ascoltaFilmOffline(() => void caricaOffline())
  }, [caricaOffline])
  useEffect(() => {
    const aggiorna = () => setSenzaRete(!navigator.onLine)
    window.addEventListener('online', aggiorna)
    window.addEventListener('offline', aggiorna)
    return () => {
      window.removeEventListener('online', aggiorna)
      window.removeEventListener('offline', aggiorna)
    }
  }, [])
  const scaricati = new Set(offline.filter((f) => f.stato === 'completo').map((f) => f.id))

  const carica = useCallback(async () => {
    setErrore(null)
    setCaricando(true)
    try {
      const esito = await elencaVideo()
      // Per i pulsanti «Guarda» del resto dell'app: un file cancellato da
      // Drive non deve più portare al lettore.
      salvaPresenti(esito.video.map((v) => v.id))
      setCartellaTrovata(esito.cartellaTrovata)
      const { visibili, nascosti: altri } = soloRiproducibili(esito.video)
      setVideo(visibili)
      setNascosti(altri)
      setCaricato(true)
      // Locandine e titoli: prima ciò che è già collegato, poi si riconoscono
      // i file nuovi. Best effort: senza, la lista resta quella dei file.
      if (user) {
        try {
          const noti = new Map((await elencaStreaming(user.id)).map((v) => [v.drive_file_id, v]))
          setArchivio(noti)
          setArchivio(await riconosciNuovi(user.id, visibili, noti))
        } catch (e) {
          logFailure('Titoli dei film di Drive')(e)
        }
      }
    } catch (e) {
      setErrore((e as Error).message)
      // Un 401 ha già dimenticato il token: torniamo a proporre il collegamento.
      setConnesso(driveConnesso())
    } finally {
      setCaricando(false)
    }
  }, [user])

  // Anno, generi e titoli originali per ordinare, filtrare e cercare: una
  // richiesta per titolo la prima volta, poi dalla cache del dispositivo. Si
  // ricarica solo quando cambiano i titoli riconosciuti, non a ogni salvataggio.
  const chiaviTitoli = [...new Set([...archivio.values()].filter((v) => v.tmdb_id && v.media_type).map((v) => `${v.media_type}-${v.tmdb_id}`))]
    .sort()
    .join(',')
  useEffect(() => {
    if (!chiaviTitoli) return
    const refs = chiaviTitoli.split(',').map((k) => {
      const [tipo, id] = k.split('-')
      return { tmdbId: Number(id), mediaType: tipo === 'tv' ? ('tv' as const) : ('movie' as const) }
    })
    let vivo = true
    Promise.all([getReleaseYears(refs), getTitleGenres(refs), getSearchTitles(refs)])
      .then(([anni, { generi, falliti: f1 }, { titoli, falliti: f2 }]) => {
        if (vivo) setInfoTitoli({ anni, generi, titoli })
        const falliti = Math.max(f1, f2)
        if (falliti > 0) logFailure('Dettagli dei titoli della videoteca')(new Error(`${falliti} titoli su ${refs.length} senza generi o titoli originali`))
      })
      .catch(logFailure('Dettagli dei titoli della videoteca'))
    return () => {
      vivo = false
    }
  }, [chiaviTitoli])
  useEffect(() => {
    if (!navigator.onLine) return
    Promise.all([getGenres('movie'), getGenres('tv')])
      .then(([film, serie]) => setNomiGeneri(new Map([...serie, ...film].map((g) => [g.id, g.name]))))
      .catch(logFailure('Nomi dei generi per la videoteca'))
  }, [])

  // Già collegati (token ancora valido in questa scheda): elenco subito, senza
  // chiedere di nuovo il permesso.
  useEffect(() => {
    if (driveConfigurato() && driveConnesso() && navigator.onLine) void carica()
  }, [carica])

  async function collega() {
    setErrore(null)
    setCaricando(true)
    try {
      await collegaDrive()
      setConnesso(true)
    } catch (e) {
      setErrore((e as Error).message)
      logFailure('collegamento a Google Drive non riuscito')(e as Error)
      setCaricando(false)
      return
    }
    await carica()
  }

  function scollega() {
    driveDisconnetti()
    setConnesso(false)
    setVideo([])
    setCaricato(false)
  }

  // Le schede della videoteca e i video della scheda scelta. Una scheda che non
  // esiste più (cartella rinominata o svuotata) torna a «Tutto».
  const schede = schedeCategorie(video)
  const schedaValida = scheda === '*' || schede.some((c) => (c.cartella ?? '') === scheda) ? scheda : '*'
  const mostrati = schedaValida === '*' ? video : video.filter((v) => (v.categoria ?? '') === schedaValida)

  // Le righe della scheda, con ciò che serve a cercarle e ordinarle.
  // Ogni video è un film o l'episodio di una serie: gli episodi si raccolgono
  // sotto la loro serie (`raggruppaSerie`), i film restano una riga ciascuno.
  const infoDi = (chiave: string) => ({
    anno: infoTitoli.anni.get(chiave) ?? null,
    generi: infoTitoli.generi.get(chiave) ?? [],
    titoli: infoTitoli.titoli.get(chiave) ?? [],
  })
  const videoPerId = new Map(mostrati.map((v) => [v.id, v]))
  const raggruppati = raggruppaSerie(
    mostrati.map((v) => ({ id: v.id, name: v.name, cartella: v.cartella, serie: v.serie ?? null, voce: archivio.get(v.id) })),
  )
  // Le righe dell'elenco: i film e una per serie.
  const voci: { riga: RigaVideoteca; video: DriveVideo }[] = raggruppati.sciolti.map((id) => {
    const v = videoPerId.get(id) as DriveVideo
    const voce = archivio.get(id)
    return {
      video: v,
      riga: {
        id,
        nome: (voce && titoloDaMostrare(voce)) ?? titoloVideo(v),
        file: v.name,
        ...infoDi(voce?.tmdb_id && voce.media_type ? `${voce.media_type}-${voce.tmdb_id}` : ''),
        aggiunto: v.aggiunto ?? null,
        guardato: voce && voce.posizione > 0 ? (voce.updated_at ?? null) : null,
      },
    }
  })
  const serie = new Map(raggruppati.serie.map((g) => [g.chiave, g]))
  for (const g of raggruppati.serie) {
    const video = g.ids.map((id) => videoPerId.get(id) as DriveVideo)
    voci.push({
      video: video[0],
      riga: {
        id: g.chiave,
        nome: g.titolo,
        // Si trova anche cercando un episodio, per nome del file o per sigla.
        file: g.episodi.map((e) => `${e.file} ${sigla(e) ?? ''}`).join('\n'),
        ...infoDi(g.tmdb),
        aggiunto: video.map((v) => v.aggiunto ?? '').sort().pop() || null,
        guardato: g.episodi.map((e) => e.guardato ?? '').sort().pop() || null,
      },
    })
  }
  const righe = voci.map((f) => f.riga)
  const videoDi = new Map(voci.map((f) => [f.riga.id, f.video]))
  const generiScheda = generiPresenti(righe, nomiGeneri)
  // Un genere che in questa scheda non c'è (cambiando scheda) vale «tutti».
  const genereValido = genere !== null && generiScheda.some((g) => g.id === genere) ? genere : null
  const elenco = ordinaVideoteca(filtraVideoteca(righe, { query, genere: genereValido }), ordine)

  // Senza Client ID configurato la funzione non esiste: lo diciamo invece di
  // mostrare un pulsante che non farebbe nulla.
  if (!driveConfigurato()) {
    return (
      <div>
        <PageHeader
          eyebrow="Streaming"
          title="La mia videoteca"
          subtitle="Guarda in streaming i film, le serie, gli anime e i cartoni che tieni su Google Drive."
        />
        <EmptyState
          title="Funzione non ancora configurata"
          message="Manca il collegamento a Google Drive (Client ID OAuth). Una volta configurato, qui compariranno i tuoi video."
          icon="🔌"
        />
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        eyebrow="Streaming"
        title="La mia videoteca"
        subtitle={`Film, serie, anime e cartoni della cartella «${CARTELLA_CIAK}» del tuo Google Drive, in streaming o scaricati sul dispositivo.`}
      >
        {connesso && (
          <div className="flex gap-2">
            <button onClick={carica} disabled={caricando} className="btn-ghost">
              🔄 Aggiorna
            </button>
            <button onClick={scollega} className="btn-ghost">
              Scollega
            </button>
          </div>
        )}
      </PageHeader>

      {errore && <ErrorState title="Qualcosa è andato storto" message={errore} />}

      {offline.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 flex items-baseline gap-2 text-sm font-semibold uppercase tracking-wider text-zinc-500">
            📱 Sul dispositivo
            {spazioUsato !== null && (
              <span className="font-normal normal-case tracking-normal text-zinc-600">· {taglia(spazioUsato)} usati da Ciak</span>
            )}
          </h2>
          <ul className="divide-y divide-theatre-800 rounded-2xl border border-theatre-800 bg-theatre-900/40">
            {offline.map((f) => (
              <li key={f.id}>
                <button
                  onClick={() => navigate(`/streaming/${f.id}`, { state: { titolo: f.titolo, file: f.file } })}
                  disabled={f.stato !== 'completo'}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-theatre-800/60 disabled:opacity-60"
                >
                  <span className="text-xl">{f.stato === 'completo' ? '📱' : f.stato === 'in-corso' ? '⬇️' : '⚠️'}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-zinc-100">{f.titolo}</span>
                    <span className="block truncate text-xs text-zinc-500">
                      {f.stato === 'completo'
                        ? `Disponibile offline${f.dimensione ? ` · ${taglia(f.dimensione)}` : ''}`
                        : f.stato === 'in-corso'
                          ? 'Download in corso…'
                          : `Download non riuscito${f.errore ? ` · ${f.errore}` : ''}`}
                    </span>
                  </span>
                  {f.stato === 'completo' && <span className="shrink-0 text-projector">▶ Guarda</span>}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {senzaRete ? (
        <EmptyState
          title="Sei offline"
          message={
            offline.some((f) => f.stato === 'completo')
              ? 'Puoi guardare i film scaricati sul dispositivo. Gli altri tornano quando torna la rete.'
              : 'Non hai film scaricati sul dispositivo. Quando torni online, apri un film e premi «Scarica per l’offline».'
          }
          icon="📴"
        />
      ) : !connesso ? (
        <div className="rounded-2xl border border-dashed border-theatre-700 p-8 text-center">
          <p className="mb-4 text-zinc-400">
            Collega il tuo Google Drive per vedere qui i video della cartella «{CARTELLA_CIAK}» e
            riprodurli in streaming. La connessione è in sola lettura e i file restano su Drive.
          </p>
          <button onClick={collega} disabled={caricando} className="btn-primary">
            {caricando ? 'Collego…' : '📁 Collega Google Drive'}
          </button>
        </div>
      ) : caricando && !caricato ? (
        <Loader />
      ) : !cartellaTrovata ? (
        <EmptyState
          title={`Nessuna cartella «${CARTELLA_CIAK}» su Drive`}
          message={`Crea una cartella chiamata «${CARTELLA_CIAK}» in «Il mio Drive», con dentro le cartelle FILM, SERIE TV, ANIME, CARTONI (o quelle che vuoi: diventano le schede) e premi «Aggiorna».`}
          icon="📂"
        />
      ) : caricato && video.length === 0 ? (
        <EmptyState
          title={nascosti > 0 ? 'Nessun film in MP4' : `La cartella «${CARTELLA_CIAK}» è vuota`}
          message={
            nascosti > 0
              ? `Ci sono ${nascosti} video in altri formati (MKV, AVI…): convertili in MP4 con converti-mkv.bat e premi «Aggiorna».`
              : 'Non ho trovato video. Se li stai ancora caricando con Google Drive per desktop, attendi la fine del caricamento e premi «Aggiorna».'
          }
          icon="🎞️"
        />
      ) : (
        <>
        {schede.length >= 2 && (
          <div role="tablist" aria-label="Categorie della videoteca" className="mb-3 flex flex-wrap gap-1">
            {[{ valore: '*', nome: 'Tutto', quanti: video.length }, ...schede.map((c) => ({ valore: c.cartella ?? '', nome: c.nome, quanti: c.quanti }))].map((c) => (
              <button
                key={c.valore}
                type="button"
                role="tab"
                aria-selected={schedaValida === c.valore}
                onClick={() => setScheda(c.valore)}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition ${
                  schedaValida === c.valore ? 'bg-theatre-800 text-projector' : 'text-zinc-400 hover:text-zinc-100'
                }`}
              >
                {c.nome} <span className="text-zinc-500">{c.quanti}</span>
              </button>
            ))}
          </div>
        )}
        {nascosti > 0 && (
          <p className="mb-3 text-sm text-zinc-500">
            {nascosti === 1 ? '1 video in un altro formato (MKV, AVI…) è nascosto' : `${nascosti} video in altri formati (MKV, AVI…) sono nascosti`}
            : Ciak riproduce gli MP4. Convertili con <code>converti-mkv.bat</code> e premi «Aggiorna».
          </p>
        )}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input
            type="search"
            aria-label="Cerca nella videoteca"
            placeholder="🔍 Cerca un titolo…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={`${filterSelectClass} min-w-0 flex-1 sm:max-w-xs`}
          />
          <select aria-label="Ordina la videoteca" value={ordine} onChange={(e) => setOrdine(e.target.value as OrdineVideoteca)} className={filterSelectClass}>
            {ORDINI_VIDEOTECA.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {generiScheda.length > 0 && (
            <select
              aria-label="Filtra per genere"
              value={genereValido ?? ''}
              onChange={(e) => setGenere(e.target.value ? Number(e.target.value) : null)}
              className={filterSelectClass}
            >
              <option value="">Tutti i generi</option>
              {generiScheda.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nome} ({g.quanti})
                </option>
              ))}
            </select>
          )}
          {elenco.length !== righe.length && (
            <span className="text-sm text-zinc-500">
              {elenco.length} di {righe.length}
            </span>
          )}
        </div>
        {elenco.length === 0 ? (
          <EmptyState title="Nessun titolo" message="Nessun video corrisponde alla ricerca o al genere scelto." icon="🔍" />
        ) : (
        <ul aria-label="Video della videoteca" className="divide-y divide-theatre-800 rounded-2xl border border-theatre-800 bg-theatre-900/40">
          {elenco.map((riga) => {
            const gruppo = serie.get(riga.id)
            if (gruppo) {
              return (
                <li key={riga.id}>
                  <SerieVideoteca
                    titolo={gruppo.titolo}
                    poster={gruppo.posterPath ? (posterUrl(gruppo.posterPath, 'w185') ?? null) : null}
                    anno={riga.anno}
                    episodi={gruppo.episodi}
                    scaricati={scaricati}
                    aperta={serieAperte.has(gruppo.cartella)}
                    onAperta={(aperta) =>
                      setSerieAperte((prima) => {
                        const dopo = new Set(prima)
                        if (aperta) dopo.add(gruppo.cartella)
                        else dopo.delete(gruppo.cartella)
                        return dopo
                      })
                    }
                    onApri={(e) =>
                      navigate(`/streaming/${e.id}`, {
                        state: { titolo: sigla(e) ? `${gruppo.titolo} · ${sigla(e)}` : e.nome, file: e.file },
                      })
                    }
                  />
                </li>
              )
            }
            const v = videoDi.get(riga.id) as DriveVideo
            const voce = archivio.get(v.id)
            const nome = riga.nome
            const avanzamento = voce?.durata ? Math.min(1, voce.posizione / voce.durata) : 0
            return (
              <li key={v.id}>
                <button
                  onClick={() => navigate(`/streaming/${v.id}`, { state: { titolo: nome, file: v.name } })}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-theatre-800/60"
                >
                  {voce?.poster_path ? (
                    <img
                      src={posterUrl(voce.poster_path, 'w185') ?? undefined}
                      alt=""
                      loading="lazy"
                      className="h-14 w-10 shrink-0 rounded object-cover"
                    />
                  ) : (
                    <span className="flex h-14 w-10 shrink-0 items-center justify-center text-xl">
                      {scaricati.has(v.id) ? '📱' : '🎬'}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-zinc-100">{nome}</span>
                    <span className="block truncate text-xs text-zinc-500">
                      {riga.anno && `${riga.anno} · `}
                      {voce?.visto_il && '✓ Visto · '}
                      {scaricati.has(v.id) && 'Offline · '}
                      {formato(v.mimeType)}
                      {taglia(v.size) && ` · ${taglia(v.size)}`}
                      {` · ${v.name}`}
                    </span>
                    {avanzamento > 0.02 && !voce?.visto_il && (
                      <span className="mt-1 block h-1 overflow-hidden rounded bg-theatre-800" aria-hidden="true">
                        <span className="block h-full bg-projector" style={{ width: `${Math.round(avanzamento * 100)}%` }} />
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-projector">{avanzamento > 0.02 && !voce?.visto_il ? '▶ Riprendi' : '▶ Guarda'}</span>
                </button>
              </li>
            )
          })}
        </ul>
        )}
        </>
      )}
    </div>
  )
}
