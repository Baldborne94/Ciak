import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import { EmptyState, ErrorState, Loader } from '../components/States'
import { logFailure } from '../lib/logFailure'
import { useAuth } from '../lib/auth'
import { usePersistedState } from '../lib/usePersistedState'
import { posterUrl } from '../lib/tmdb'
import { filtraVideoteca, generiPresenti, ordinaVideoteca, sigla, type GruppoSerie, type OrdineVideoteca, type RigaVideoteca } from '../lib/videoteca'
import SerieVideoteca from '../components/SerieVideoteca'
import SagaVideoteca from '../components/SagaVideoteca'
import FilmVideoteca from '../components/FilmVideoteca'
import ModaliSaghe, { type SagaInModifica } from '../components/ModaliSaghe'
import ElencoSulDispositivo from '../components/ElencoSulDispositivo'
import VideotecaDaCollegare from '../components/VideotecaDaCollegare'
import SchedeVideoteca from '../components/SchedeVideoteca'
import FiltriVideoteca from '../components/FiltriVideoteca'
import { raccolteUtente } from '../lib/lists'
import { copertinaUrl, type Raccolta } from '../lib/raccolte'
import Modal from '../components/Modal'
import SceltaTitolo from '../components/SceltaTitolo'
import { abbinaAMano, voceVuota } from '../lib/riconoscimento'
import { filmDaCercare } from '../lib/sottotitoli'
import type { MediaItem } from '../lib/types'
import { dimenticaVideoteca } from '../lib/useVideoteca'
import { eliminaFilm } from '../lib/filmOffline'
import { CARTELLA_CIAK, schedeCategorie, type VideoFile } from '../lib/fileVideo'
import { etichettaCopia } from '../lib/offlineCache'
import { leggiJellyfin } from '../lib/jellyfin'
import CollegaJellyfin from '../components/CollegaJellyfin'
import ApriFilmLocale from '../components/ApriFilmLocale'
import ScegliCartella from '../components/ScegliCartella'
import { eLocale } from '../lib/filmLocali'
import { cancellabileDalDisco, cancellaDalDisco } from '../lib/cartellaLocale'
import { componiVideoteca, type FilmDellElenco } from '../lib/elencoVideoteca'
import { useElencoVideoteca } from '../lib/useElencoVideoteca'
import { useInfoTitoli } from '../lib/useInfoTitoli'
import { useSulDispositivo } from '../lib/useSulDispositivo'
import { useSerieInCiak } from '../lib/useSerieInCiak'

// La videoteca: i video della cartella collegata del PC e del server di casa,
// divisi in schede (le cartelle di primo livello), con le serie raccolte in
// stagioni e i film della stessa saga insieme. L'elenco lo carica
// useElencoVideoteca; qui si sceglie cosa mostrare e come.
export default function StreamingPage() {
  const navigate = useNavigate()
  // Tornando dal lettore dopo una cancellazione: lo si dice, perché l'elenco
  // senza quel titolo non spiega da solo dov'è finito.
  const cancellatoDalLettore = (useLocation().state as { cancellato?: string } | null)?.cancellato ?? null
  // Cancellando una serie o una saga da qui: lo stesso avviso del lettore.
  const [cancellatoQui, setCancellatoQui] = useState<string | null>(null)
  const cancellato = cancellatoQui ?? cancellatoDalLettore
  const [cancellando, setCancellando] = useState<string | null>(null)
  const { user } = useAuth()
  const elenco = useElencoVideoteca(user)
  const { archivio, setArchivio, video, nascosti, extra, copiaDel, caricato, caricando, errore, setErrore, carica, cartella } = elenco
  const collegato = elenco.casaCollegata || cartella !== null
  const [moduloCasa, setModuloCasa] = useState(false)
  // La scheda scelta (una cartella di primo livello), ricordata fra un'apertura
  // e l'altra. '*' = tutto.
  const [scheda, setScheda] = usePersistedState<string>('ciak:videoteca-scheda', '*')
  // Ricerca, ordine e genere: l'ordine si ricorda, gli altri due no (riaprendo
  // la videoteca la si vuole vedere tutta).
  const [query, setQuery] = useState('')
  const [ordine, setOrdine] = usePersistedState<OrdineVideoteca>('ciak:videoteca-ordine', 'titolo')
  const [genere, setGenere] = useState<number | null>(null)
  const [soloDaSistemare, setSoloDaSistemare] = useState(false)
  // Le serie aperte, per nome di cartella: la chiave della serie cambia quando
  // viene riconosciuta, e la lista aperta si richiudeva da sola.
  const [serieAperte, setSerieAperte] = useState<Set<string>>(new Set())
  // «Scegli il titolo» dalla videoteca: per una serie intera o per un film.
  const [scelta, setScelta] = useState<{ nome: string; ricerca: string; video: VideoFile[] } | null>(null)
  const { info: infoTitoli, nomiGeneri } = useInfoTitoli(archivio)
  // Le «Mie liste», che qui diventano raccolte: cartelle coi titoli della videoteca.
  const [raccolte, setRaccolte] = useState<Raccolta[]>([])
  // La saga fatta a mano di cui si sta scegliendo la copertina, e quella che si
  // sta creando o cambiando (vedi ModaliSaghe).
  const [copertinaDi, setCopertinaDi] = useState<string | null>(null)
  const [inModifica, setInModifica] = useState<SagaInModifica | null>(null)
  const { offline, senzaRete, spazioUsato, scaricati } = useSulDispositivo()
  const inCiak = useSerieInCiak({ video, archivio, vistiNelDiario: elenco.vistiNelDiario, offline, scaricati, letture: elenco.letture })

  const caricaRaccolte = useCallback(async () => {
    if (!user) return
    setRaccolte(await raccolteUtente(user.id))
  }, [user])
  useEffect(() => {
    void caricaRaccolte().catch(logFailure('Raccolte della videoteca (le Mie liste)'))
  }, [caricaRaccolte])

  async function casaCollegataOra() {
    setModuloCasa(false)
    await elenco.casaPronta()
  }

  async function abbina(item: MediaItem) {
    if (!user || !scelta) return
    try {
      const salvati = await abbinaAMano(user.id, scelta.video, item)
      setArchivio((prima) => {
        const dopo = new Map(prima)
        for (const [id, campi] of salvati) dopo.set(id, { ...(prima.get(id) ?? voceVuota(id)), ...campi })
        return dopo
      })
      // Le schede dei titoli e la Sala devono vedere subito il nuovo «Guarda».
      dimenticaVideoteca()
      setScelta(null)
    } catch (e) {
      setErrore((e as Error).message)
      setScelta(null)
    }
  }

  // Una serie o una saga intera cancellata dal disco, coi sottotitoli, le
  // lingue dell'audio e le cartelle rimaste vuote. Non passa dal Cestino di
  // Windows: la conferma lo dice. Le copie salvate in Ciak vanno con lei.
  async function cancellaGruppo(chiave: string, nome: string, tutti: VideoFile[]) {
    // Sul server di casa i file si cancellano dal PC: Ciak li legge soltanto.
    const video = tutti.filter((v) => eLocale(v.id))
    if (video.length === 0) {
      setErrore(`«${nome}» sta sul server di casa: si cancella dal PC (Esplora file), poi premi «Aggiorna».`)
      return
    }
    if (!cancellabileDalDisco()) {
      setErrore(
        'Questo browser lascia solo leggere i file: per cancellarli dal disco apri Ciak con Chrome o Edge, oppure cancellali da Esplora file e premi «Aggiorna».',
      )
      return
    }
    const quanti = video.length === 1 ? '1 file' : `${video.length} file`
    if (!window.confirm(`Vuoi cancellare «${nome}» dal disco?\nSono ${quanti}, coi loro sottotitoli, nella cartella «${cartella}». Non finiscono nel Cestino: non si recuperano.`)) return
    setErrore(null)
    setCancellando(chiave)
    try {
      await cancellaDalDisco(video.map((v) => v.id))
      for (const v of video) {
        if (scaricati.has(v.id)) await eliminaFilm(v.id).catch(logFailure('Eliminazione del film salvato in Ciak'))
      }
      setCancellatoQui(nome)
      dimenticaVideoteca()
      await carica()
    } catch (e) {
      setErrore(`Cancellazione di «${nome}» non riuscita: ${e instanceof Error ? e.message : 'errore sconosciuto'}`)
      logFailure('Cancellazione di una serie o saga dal disco')(e)
    } finally {
      setCancellando(null)
    }
  }

  // Le schede della videoteca e i video della scheda scelta. Una scheda che non
  // esiste più (cartella rinominata o svuotata) torna a «Tutto».
  const schede = schedeCategorie(video)
  const schedaValida = scheda === '*' || schede.some((c) => (c.cartella ?? '') === scheda) ? scheda : '*'
  const mostrati = schedaValida === '*' ? video : video.filter((v) => (v.categoria ?? '') === schedaValida)
  const composta = componiVideoteca(mostrati, archivio, infoTitoli, raccolte, elenco.vistiNelDiario)
  const { infoDi, videoPerId, filmPerId, chiaveTitolo, serie, saghe, voci } = composta
  const righe = voci.map((f) => f.riga)
  const videoDi = new Map(voci.map((f) => [f.riga.id, f.video]))
  const generiScheda = generiPresenti(righe, nomiGeneri)
  // Un genere che in questa scheda non c'è (cambiando scheda) vale «tutti».
  const genereValido = genere !== null && generiScheda.some((g) => g.id === genere) ? genere : null
  const quantiDaSistemare = righe.filter((r) => r.daSistemare).length
  // Sistemato l'ultimo, il filtro si spegne da solo invece di lasciare un elenco vuoto.
  const filtroDaSistemare = soloDaSistemare && quantiDaSistemare > 0
  const elencoMostrato = ordinaVideoteca(filtraVideoteca(righe, { query, genere: genereValido, daSistemare: filtroDaSistemare }), ordine)

  const rigaSerie = (gruppo: GruppoSerie) => (
    <SerieVideoteca
      titolo={gruppo.titolo}
      poster={gruppo.posterPath ? (posterUrl(gruppo.posterPath, 'w185') ?? null) : null}
      anno={infoDi(gruppo.tmdb).anno}
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
      riconosciuta={!!gruppo.tmdb}
      tmdbId={gruppo.tmdb.startsWith('tv-') ? Number(gruppo.tmdb.slice(3)) : null}
      onScegliTitolo={() =>
        setScelta({
          nome: gruppo.titolo,
          ricerca: gruppo.titolo,
          video: gruppo.ids.map((id) => videoPerId.get(id) as VideoFile),
        })
      }
      onScegliFile={(e) => {
        const v = videoPerId.get(e.id) as VideoFile
        setScelta({ nome: e.nome, ricerca: filmDaCercare(v.name, v.cartella, v.serie ?? null).titolo, video: [v] })
      }}
      onCancella={() => void cancellaGruppo(gruppo.chiave, gruppo.titolo, gruppo.ids.map((id) => videoPerId.get(id) as VideoFile))}
      cancellando={cancellando === gruppo.chiave}
      inCiak={inCiak.rigaDi(gruppo)}
      onSegnaVisto={gruppo.tmdb.startsWith('tv-') ? (e, visto) => void elenco.segnaEpisodio({ tvId: Number(gruppo.tmdb.slice(3)), titolo: gruppo.titolo }, e, visto) : undefined}
    />
  )

  const rigaFilm = (v: VideoFile, riga: RigaVideoteca) => (
    <FilmVideoteca
      video={v}
      voce={archivio.get(v.id)}
      nome={riga.nome}
      anno={riga.anno}
      scaricato={scaricati.has(v.id)}
      onApri={() => navigate(`/streaming/${v.id}`, { state: { titolo: riga.nome, file: v.name } })}
      onScegli={() => setScelta({ nome: riga.nome, ricerca: filmDaCercare(v.name, v.cartella, v.serie ?? null).titolo, video: [v] })}
    />
  )

  const rigaSaga = (chiave: string) => {
    const saga = saghe.get(chiave)
    if (!saga) return null
    const suoi = saga.ids.map((id) => filmPerId.get(id) as FilmDellElenco)
    const anni = suoi.map((f) => f.riga.anno).filter((a): a is string => !!a)
    const primaLocandina = suoi.map((f) => archivio.get(f.video.id)?.poster_path).find((p): p is string => !!p) ?? null
    const listaId = saga.saga.listaId
    return (
      <SagaVideoteca
        nome={saga.saga.name}
        poster={
          // Fatta a mano: la copertina scelta, se no la locandina del primo film.
          listaId
            ? (copertinaUrl(saga.saga.copertina ?? null, 'w780') ?? posterUrl(primaLocandina, 'w185'))
            : posterUrl(saga.saga.posterPath, 'w185')
        }
        azioni={
          !listaId ? (
            // Una saga di TMDB: modificandola diventa tua, al suo posto.
            <button
              type="button"
              onClick={() =>
                setInModifica({
                  listaId: null,
                  daTmdb: {
                    id: Number(saga.chiave.slice('saga-'.length)),
                    nome: saga.saga.name,
                    chiavi: new Set(suoi.flatMap((f) => chiaveTitolo(f.riga.id) ?? [])),
                  },
                })
              }
              className="text-xs text-zinc-400 transition hover:text-projector"
            >
              ✎ Modifica la saga
            </button>
          ) : (
            <>
              <button type="button" onClick={() => setInModifica({ listaId })} className="text-xs text-zinc-400 transition hover:text-projector">
                ✎ Modifica la saga
              </button>
              <button type="button" onClick={() => setCopertinaDi(listaId)} className="text-xs text-zinc-400 transition hover:text-projector">
                🖼️ Cambia copertina
              </button>
            </>
          )
        }
        quanti={suoi.length}
        visti={suoi.filter((f) => !!archivio.get(f.video.id)?.visto_il).length}
        anni={anni.length === 0 ? null : anni[0] === anni[anni.length - 1] ? anni[0] : `${anni[0]}–${anni[anni.length - 1]}`}
        apertaSempre={query.trim() !== ''}
        onCancella={() => void cancellaGruppo(saga.chiave, saga.saga.name, suoi.map((f) => f.video))}
        cancellando={cancellando === saga.chiave}
      >
        {suoi.map((f) => (
          <li key={f.video.id}>{rigaFilm(f.video, f.riga)}</li>
        ))}
      </SagaVideoteca>
    )
  }

  return (
    <div>
      <PageHeader
        eyebrow="Streaming"
        title="La mia videoteca"
        subtitle="Film, serie, anime e cartoni della cartella collegata del PC, quelli che apri dal dispositivo e quelli salvati in Ciak, col lettore di Ciak."
      >
        {collegato && (
          <div className="flex flex-wrap items-start gap-2">
            {elenco.cartellaDaRiaprire && (
              <ScegliCartella
                riapri
                etichetta={`📂 Riapri la cartella «${cartella}»`}
                className="btn-primary"
                onFatto={() => void elenco.cartellaPronta()}
                onErrore={setErrore}
              />
            )}
            <ApriFilmLocale />
            <button onClick={carica} disabled={caricando} className="btn-ghost">
              🔄 Aggiorna
            </button>
            {cartella ? (
              <button onClick={() => void elenco.scollegaLaCartella()} className="btn-ghost">
                Scollega la cartella
              </button>
            ) : (
              <ScegliCartella etichetta="📂 Collega una cartella" onFatto={() => void elenco.cartellaPronta()} onErrore={setErrore} />
            )}
            {!elenco.casaCollegata && !moduloCasa && (
              <button onClick={() => setModuloCasa(true)} className="btn-ghost">
                🏠 Server di casa
              </button>
            )}
            {elenco.casaCollegata && (
              <button onClick={elenco.scollegaCasa} className="btn-ghost" title={leggiJellyfin()?.url}>
                Scollega il server di casa
              </button>
            )}
          </div>
        )}
      </PageHeader>

      {errore && <ErrorState title="Qualcosa è andato storto" message={errore} />}
      {moduloCasa && collegato && (
        <section className="mb-6 rounded-2xl border border-theatre-800 bg-theatre-900/40 p-6">
          <h2 className="mb-1 text-center text-lg font-semibold text-zinc-100">Il server di casa</h2>
          <p className="mb-4 text-center text-sm text-zinc-400">I film del disco attaccato al PC, attraverso Jellyfin: compaiono qui insieme a quelli della cartella.</p>
          <CollegaJellyfin onCollegato={() => void casaCollegataOra()} onAnnulla={() => setModuloCasa(false)} />
        </section>
      )}
      {cancellato && (
        <p role="status" className="mb-6 rounded-xl border border-theatre-800 bg-theatre-900/40 px-4 py-3 text-sm text-zinc-300">
          🗑 «{cancellato}» è stato cancellato dal disco.
        </p>
      )}

      {offline.length > 0 && (
        <ElencoSulDispositivo
          film={offline}
          spazioUsato={spazioUsato}
          onApri={(f) => navigate(`/streaming/${f.id}`, { state: { titolo: f.titolo, file: f.file } })}
        />
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
      ) : !collegato ? (
        <VideotecaDaCollegare
          onCartellaPronta={() => void elenco.cartellaPronta()}
          onErrore={setErrore}
          moduloCasa={moduloCasa}
          onModuloCasa={setModuloCasa}
          onCasaCollegata={() => void casaCollegataOra()}
        />
      ) : caricando && !caricato && copiaDel === null ? (
        <Loader />
      ) : caricato && video.length === 0 ? (
        <EmptyState
          title={nascosti > 0 ? 'Nessun film in MP4' : `La cartella «${CARTELLA_CIAK}» è vuota`}
          message={
            nascosti > 0
              ? `Ci sono ${nascosti} video in altri formati (MKV, AVI…): convertili in MP4 con prepara-ciak e premi «Aggiorna».`
              : `Non ho trovato video nella cartella «${cartella ?? CARTELLA_CIAK}». Mettici dentro le cartelle FILM, SERIE TV, ANIME (diventano le schede) e premi «Aggiorna».`
          }
          icon="🎞️"
        />
      ) : (
        <>
          {schede.length >= 2 && <SchedeVideoteca schede={schede} totale={video.length} scelta={schedaValida} onScegli={setScheda} />}
          {nascosti > 0 && (
            <p className="mb-3 text-sm text-zinc-500">
              {nascosti === 1 ? '1 video in un altro formato (MKV, AVI…) è nascosto' : `${nascosti} video in altri formati (MKV, AVI…) sono nascosti`}
              : Ciak riproduce gli MP4. Convertili con prepara-ciak e premi «Aggiorna».
            </p>
          )}
          {copiaDel !== null && (
            // Un elenco vecchio senza dirlo farebbe cercare un film appena caricato.
            <p role="status" className="mb-3 text-sm text-zinc-500">
              🔄 Copia dell’elenco {etichettaCopia(copiaDel)}: {caricando ? 'la aggiorno dalla cartella…' : 'premi «Aggiorna» per rileggere la cartella.'}
            </p>
          )}
          {extra > 0 && (
            <p className="mb-3 text-sm text-zinc-500">
              {extra === 1 ? '1 extra (featurette, trailer, anteprime…) non è in elenco' : `${extra} extra (featurette, trailer, anteprime…) non sono in elenco`}
              : sono extra dei film o scarti delle release (anteprime, promo), non titoli da guardare.
            </p>
          )}
          <FiltriVideoteca
            query={query}
            onQuery={setQuery}
            ordine={ordine}
            onOrdine={setOrdine}
            generi={generiScheda}
            genere={genereValido}
            onGenere={setGenere}
            daSistemare={quantiDaSistemare}
            soloDaSistemare={filtroDaSistemare}
            onSoloDaSistemare={() => setSoloDaSistemare((s) => !s)}
            onCreaSaga={composta.filmPerSaga.length > 0 ? () => setInModifica({ listaId: null }) : null}
            mostrati={elencoMostrato.length}
            totale={righe.length}
          />
          {filtroDaSistemare && (
            <p className="mb-3 text-sm text-zinc-500">
              Titoli che Ciak non ha riconosciuto, senza copertina o con episodi che non sa dove mettere. Per un film premi ✎ (anche accanto a un file fra gli «Altri episodi»); per
              una serie aprila e premi «Scegli il titolo».
            </p>
          )}
          {elencoMostrato.length === 0 ? (
            <EmptyState title="Nessun titolo" message="Nessun video corrisponde alla ricerca o al genere scelto." icon="🔍" />
          ) : (
            <ul aria-label="Video della videoteca" className="divide-y divide-theatre-800 rounded-2xl border border-theatre-800 bg-theatre-900/40">
              {elencoMostrato.map((riga) => {
                const gruppo = serie.get(riga.id)
                return (
                  <li key={riga.id}>
                    {gruppo ? rigaSerie(gruppo) : saghe.has(riga.id) ? rigaSaga(riga.id) : rigaFilm(videoDi.get(riga.id) as VideoFile, riga)}
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}

      <ModaliSaghe
        userId={user?.id ?? null}
        inModifica={inModifica}
        onChiudiModifica={() => setInModifica(null)}
        copertinaDi={copertinaDi}
        onChiudiCopertina={() => setCopertinaDi(null)}
        raccolte={raccolte}
        onCopertina={(listId, copertina) => setRaccolte((prima) => prima.map((r) => (r.id === listId ? { ...r, copertina } : r)))}
        ricaricaRaccolte={caricaRaccolte}
        composta={composta}
        archivio={archivio}
        onErrore={setErrore}
      />
      {scelta && (
        <Modal title={`Che titolo è «${scelta.nome}»?`} onClose={() => setScelta(null)}>
          <p className="mb-3 text-sm text-zinc-400">
            {scelta.video.length > 1
              ? `Vale per tutti i ${scelta.video.length} file: ognuno tiene stagione ed episodio del suo nome.`
              : 'Cerca il titolo giusto e sceglilo: resta scelto anche dopo «Aggiorna».'}
          </p>
          <SceltaTitolo ricercaIniziale={scelta.ricerca} onScegli={abbina} />
        </Modal>
      )}
    </div>
  )
}
