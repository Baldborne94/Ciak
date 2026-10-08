import { useCallback, useEffect, useState, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import { EmptyState, ErrorState, Loader } from '../components/States'
import { logFailure } from '../lib/logFailure'
import { useAuth } from '../lib/auth'
import { usePersistedState } from '../lib/usePersistedState'
import { getGenres, getReleaseYears, getSearchTitles, getTitleGenres, getTitleSagas, posterUrl } from '../lib/tmdb'
import { filterSelectClass } from '../components/FilterBar'
import {
  filtraVideoteca,
  generiPresenti,
  ORDINI_VIDEOTECA,
  ordinaVideoteca,
  raggruppaSerie,
  serieDaSistemare,
  sigla,
  type GruppoSerie,
  type OrdineVideoteca,
  type RigaVideoteca,
} from '../lib/videoteca'
import SerieVideoteca from '../components/SerieVideoteca'
import SagaVideoteca from '../components/SagaVideoteca'
import FilmVideoteca from '../components/FilmVideoteca'
import { raggruppaSaghe, unisciSaghe, type GruppoSaga } from '../lib/saghe'
import { aggiornaCopertina, creaSaga, deleteList, modificaSaga, raccolteUtente } from '../lib/lists'
import ModificaSaga from '../components/ModificaSaga'
import { copertinaUrl, type Raccolta } from '../lib/raccolte'
import RiquadroRaccolta from '../components/RiquadroRaccolta'
import SceltaCopertina from '../components/SceltaCopertina'
import Modal from '../components/Modal'
import SceltaTitolo from '../components/SceltaTitolo'
import { abbinaAMano, riconosciNuovi, voceVuota } from '../lib/riconoscimento'
import { filmDaCercare } from '../lib/sottotitoli'
import type { Collection, MediaItem } from '../lib/types'
import { salvaPresenti } from '../lib/videoPresenti'
import { dimenticaVideoteca } from '../lib/useVideoteca'
import { elencaStreaming, titoloDaMostrare, type VoceStreaming } from '../lib/streaming'
import { ascoltaFilmOffline, elencaFilmOffline, eliminaFilm, offlineDisponibile, spazio, taglia, type FilmOffline } from '../lib/filmOffline'
import {
  CARTELLA_CIAK,
  driveConfigurato,
  EVENTO_DRIVE,
  driveConnesso,
  driveDisconnetti,
  collegaDrive,
  cestinaGruppo,
  erroreRitornoDrive,
  elencaVideo,
  schedeCategorie,
  senzaExtra,
  soloRiproducibili,
  titoloVideo,
  type DriveVideo,
} from '../lib/googleDrive'

export default function StreamingPage() {
  const navigate = useNavigate()
  // Tornando dal lettore dopo una cancellazione: lo si dice, perché l'elenco
  // senza quel titolo non spiega da solo dov'è finito.
  const cestinatoDalLettore = (useLocation().state as { cestinato?: string } | null)?.cestinato ?? null
  // Cancellando una serie o una saga da qui: lo stesso avviso del lettore.
  const [cestinatoQui, setCestinatoQui] = useState<string | null>(null)
  const cestinato = cestinatoQui ?? cestinatoDalLettore
  const [cancellando, setCancellando] = useState<string | null>(null)
  const { user } = useAuth()
  // Il legame di ogni file col suo titolo (locandina, «visto», punto di ripresa).
  const [archivio, setArchivio] = useState<Map<string, VoceStreaming>>(new Map())
  const [connesso, setConnesso] = useState(driveConnesso())
  const [video, setVideo] = useState<DriveVideo[]>([])
  const [nascosti, setNascosti] = useState(0)
  const [extra, setExtra] = useState(0)
  // La scheda scelta (una cartella di primo livello), ricordata fra un'apertura
  // e l'altra. '*' = tutto.
  const [scheda, setScheda] = usePersistedState<string>('ciak:videoteca-scheda', '*')
  const [cartellaTrovata, setCartellaTrovata] = useState(true)
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
  const [scelta, setScelta] = useState<{ nome: string; ricerca: string; video: DriveVideo[] } | null>(null)
  // Anno, generi e titoli originali dei titoli riconosciuti (chiave composta
  // `${tipo}-${id}`), e i nomi italiani dei generi.
  const [infoTitoli, setInfoTitoli] = useState<{
    anni: Map<string, string | null>
    generi: Map<string, number[]>
    titoli: Map<string, string[]>
    saghe: Map<string, Collection | null>
  }>({ anni: new Map(), generi: new Map(), titoli: new Map(), saghe: new Map() })
  const [nomiGeneri, setNomiGeneri] = useState<Map<number, string>>(new Map())
  // Le «Mie liste», che qui diventano raccolte: cartelle coi titoli su Drive.
  const [raccolte, setRaccolte] = useState<Raccolta[]>([])
  const [raccoltaAperta, setRaccoltaAperta] = useState<string | null>(null)
  // La raccolta di cui si sta scegliendo la copertina (il modale aperto).
  const [copertinaDi, setCopertinaDi] = useState<string | null>(null)
  // La saga fatta a mano che si sta creando (listaId null) o cambiando.
  const [sagaInModifica, setSagaInModifica] = useState<{ listaId: string | null } | null>(null)
  const [salvandoSaga, setSalvandoSaga] = useState(false)
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
    inCorso.current = true
    setErrore(null)
    setCaricando(true)
    try {
      const esito = await elencaVideo()
      // Per i pulsanti «Guarda» del resto dell'app: un file cancellato da
      // Drive non deve più portare al lettore.
      salvaPresenti(esito.video.map((v) => v.id))
      setCartellaTrovata(esito.cartellaTrovata)
      const { visibili: mp4, nascosti: altri } = soloRiproducibili(esito.video)
      const { visibili, extra: daParte } = senzaExtra(mp4)
      setVideo(visibili)
      setNascosti(altri)
      setExtra(daParte)
      setCaricato(true)
      // Locandine e titoli: prima ciò che è già collegato, poi si riconoscono
      // i file nuovi. Best effort: senza, la lista resta quella dei file.
      if (user) {
        try {
          const noti = new Map((await elencaStreaming(user.id)).map((v) => [v.drive_file_id, v]))
          setArchivio(noti)
          setArchivio(await riconosciNuovi(user.id, visibili, noti, new Set(esito.video.map((v) => v.id))))
          dimenticaVideoteca()
        } catch (e) {
          logFailure('Titoli dei film di Drive')(e)
        }
      }
    } catch (e) {
      setErrore((e as Error).message)
      // Un 401 ha già dimenticato il token: torniamo a proporre il collegamento.
      setConnesso(driveConnesso())
    } finally {
      inCorso.current = false
      setCaricando(false)
    }
  }, [user])

  const caricaRaccolte = useCallback(async () => {
    if (!user) return
    setRaccolte(await raccolteUtente(user.id))
  }, [user])
  useEffect(() => {
    void caricaRaccolte().catch(logFailure('Raccolte della videoteca (le Mie liste)'))
  }, [caricaRaccolte])

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
    Promise.all([
      getReleaseYears(refs),
      getTitleGenres(refs),
      getSearchTitles(refs),
      // Le saghe ce le hanno solo i film.
      getTitleSagas(refs.filter((r) => r.mediaType === 'movie')),
    ])
      .then(([anni, { generi, falliti: f1 }, { titoli, falliti: f2 }, { saghe, falliti: f3 }]) => {
        if (vivo) setInfoTitoli({ anni, generi, titoli, saghe })
        const falliti = Math.max(f1, f2, f3)
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
  // Il permesso rinnovato in sottofondo (dal server di Ciak): la pagina se ne
  // accorge e carica, senza un pulsante da premere. Non mentre sta già
  // caricando (il collegamento a mano salva il token a metà del suo giro):
  // due caricamenti insieme riconoscevano i titoli due volte.
  const inCorso = useRef(false)
  useEffect(() => {
    const cambiato = () => {
      const c = driveConnesso()
      setConnesso(c)
      // `caricando` è alto anche mentre «Collega» aspetta Google: il token
      // arriva prima che `collega()` chiami il suo `carica()`.
      if (c && !caricato && !caricando && !inCorso.current && navigator.onLine) void carica()
    }
    window.addEventListener(EVENTO_DRIVE, cambiato)
    return () => window.removeEventListener(EVENTO_DRIVE, cambiato)
  }, [carica, caricato, caricando])

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

  // Una serie o una saga intera nel cestino di Drive, coi sottotitoli e le
  // cartelle rimaste vuote: dal cestino Google la recupera per trenta giorni,
  // quindi basta una conferma. Le copie sul dispositivo vanno con lei.
  async function cancellaGruppo(chiave: string, nome: string, video: DriveVideo[]) {
    const quanti = video.length === 1 ? '1 file' : `${video.length} file`
    if (!window.confirm(`Vuoi cancellare «${nome}» da Google Drive?\nSono ${quanti}, coi loro sottotitoli: finiscono nel cestino di Drive, da dove si recuperano per 30 giorni.`)) return
    setErrore(null)
    setCancellando(chiave)
    try {
      await cestinaGruppo(video)
      for (const v of video) {
        if (scaricati.has(v.id)) await eliminaFilm(v.id).catch(logFailure('Eliminazione del film offline'))
      }
      setCestinatoQui(nome)
      dimenticaVideoteca()
      await carica()
    } catch (e) {
      const messaggio = e instanceof Error ? e.message : 'Cancellazione non riuscita.'
      setErrore(
        messaggio.includes('403')
          ? 'Per cancellare serve un permesso che Ciak non ha ancora chiesto a Google: premi «Scollega», ricollega Drive e riprova.'
          : `Cancellazione di «${nome}» non riuscita: ${messaggio}`,
      )
      logFailure('Cancellazione di una serie o saga da Drive')(e)
    } finally {
      setCancellando(null)
    }
  }

  // Una saga fatta a mano: una lista segnata come saga, coi film scelti.
  async function salvaSaga(nome: string, chiavi: string[]) {
    if (!user || !sagaInModifica) return
    const perChiave = new Map(filmPerSaga.map((f) => [f.chiave, f]))
    const ref = (k: string) => {
      const f = perChiave.get(k)
      const voce = film.map((x) => archivio.get(x.video.id)).find((v) => v?.media_type === 'movie' && `movie-${v.tmdb_id}` === k)
      return { tmdbId: Number(k.slice('movie-'.length)), mediaType: 'movie' as const, title: f?.titolo ?? k, posterPath: voce?.poster_path ?? null }
    }
    setSalvandoSaga(true)
    try {
      if (!sagaInModifica.listaId) {
        await creaSaga(user.id, nome, chiavi.map(ref))
      } else {
        const prima = raccolte.find((r) => r.id === sagaInModifica.listaId)?.chiavi ?? new Set<string>()
        const togli = [...prima]
          .filter((k) => k.startsWith('movie-') && !chiavi.includes(k))
          .map((k) => ({ tmdbId: Number(k.slice('movie-'.length)), mediaType: 'movie' as const }))
        await modificaSaga(user.id, sagaInModifica.listaId, nome, chiavi.filter((k) => !prima.has(k)).map(ref), togli)
      }
      await caricaRaccolte()
      setSagaInModifica(null)
    } catch (e) {
      const messaggio = (e as Error).message
      setErrore(
        /come_saga/.test(messaggio)
          ? 'Per le saghe fatte a mano il database va aggiornato: esegui supabase/schema_v21_saghe_manuali.sql nel SQL Editor di Supabase.'
          : `Saga non salvata: ${messaggio}`,
      )
      setSagaInModifica(null)
      logFailure('Saga fatta a mano')(e)
    } finally {
      setSalvandoSaga(false)
    }
  }

  // Sciogliere una saga toglie solo la lista: i file restano, e ogni film
  // torna al suo posto nell'elenco.
  async function sciogliSaga(listaId: string, nome: string) {
    if (!window.confirm(`Vuoi sciogliere la saga «${nome}»?\nI film restano su Drive e tornano al loro posto nell'elenco.`)) return
    try {
      await deleteList(listaId)
      await caricaRaccolte()
      setSagaInModifica(null)
    } catch (e) {
      setErrore(`Saga non sciolta: ${(e as Error).message}`)
      logFailure('Saga fatta a mano')(e)
    }
  }

  async function scegliCopertina(listId: string, copertina: string | null) {
    try {
      await aggiornaCopertina(listId, copertina)
      setRaccolte((prima) => prima.map((r) => (r.id === listId ? { ...r, copertina } : r)))
      setCopertinaDi(null)
    } catch (e) {
      setErrore(`Copertina non salvata: ${(e as Error).message}`)
      setCopertinaDi(null)
      logFailure('Copertina della raccolta')(e)
    }
  }

  function scollega() {
    driveDisconnetti(true)
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
  const film: { riga: RigaVideoteca; video: DriveVideo }[] = raggruppati.sciolti.map((id) => {
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
        daSistemare: !voce?.tmdb_id || !voce.poster_path,
      },
    }
  })
  // I film della stessa saga (Alien, Harry Potter…) in una cartella sola.
  const chiaveTitolo = (id: string) => {
    const voce = archivio.get(id)
    return voce?.tmdb_id && voce.media_type === 'movie' ? `movie-${voce.tmdb_id}` : null
  }
  const filmPerId = new Map(film.map((f) => [f.riga.id, f]))
  const perSaghe = raggruppaSaghe(
    film.map((f) => ({ id: f.riga.id, chiave: chiaveTitolo(f.riga.id), anno: f.riga.anno })),
    // Le saghe di TMDB e quelle fatte a mano (le liste segnate come saga).
    unisciSaghe(infoTitoli.saghe, raccolte),
  )
  const voci = perSaghe.sciolti.map((id) => filmPerId.get(id) as { riga: RigaVideoteca; video: DriveVideo })
  const saghe = new Map<string, GruppoSaga>(perSaghe.saghe.map((g) => [g.chiave, g]))
  for (const g of perSaghe.saghe) {
    const suoi = g.ids.map((id) => (filmPerId.get(id) as { riga: RigaVideoteca }).riga)
    const anni = suoi.map((r) => r.anno).filter((a): a is string => !!a)
    voci.push({
      video: (filmPerId.get(g.ids[0]) as { video: DriveVideo }).video,
      riga: {
        id: g.chiave,
        nome: g.saga.name,
        // Cercando un film della saga si trova la saga, che si apre da sola.
        file: suoi.map((r) => `${r.nome} ${r.file}`).join('\n'),
        anno: anni[0] ?? null,
        generi: [...new Set(suoi.flatMap((r) => r.generi))],
        titoli: suoi.flatMap((r) => r.titoli),
        aggiunto: suoi.map((r) => r.aggiunto ?? '').sort().pop() || null,
        guardato: suoi.map((r) => r.guardato ?? '').sort().pop() || null,
        daSistemare: suoi.some((r) => r.daSistemare),
      },
    })
  }
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
        daSistemare: serieDaSistemare(g),
      },
    })
  }
  // Le raccolte di questa scheda: i film e le serie della lista che sono su
  // Drive. Un titolo resta anche al suo posto nell'elenco, e può stare in più
  // raccolte. Quelle senza niente qui non si mostrano.
  const raccolteScheda = raccolte
    .filter((r) => !r.comeSaga)
    .map((r) => ({
      raccolta: r,
      film: film.filter((f) => {
        const k = chiaveTitolo(f.riga.id)
        return k !== null && r.chiavi.has(k)
      }),
      serie: raggruppati.serie.filter((g) => !!g.tmdb && r.chiavi.has(g.tmdb)),
    }))
    .filter((x) => x.film.length + x.serie.length > 0)
  const apertaQui = raccolteScheda.find((x) => x.raccolta.id === raccoltaAperta) ?? null
  // La copertina si sceglie per una raccolta o per una saga fatta a mano: le
  // immagini sono quelle dei loro titoli.
  const listaCopertina = raccolte.find((r) => r.id === copertinaDi) ?? null
  const perCopertina = listaCopertina
    ? {
        raccolta: listaCopertina,
        film: film.filter((f) => {
          const k = chiaveTitolo(f.riga.id)
          return k !== null && listaCopertina.chiavi.has(k)
        }),
        serie: raggruppati.serie.filter((g) => !!g.tmdb && listaCopertina.chiavi.has(g.tmdb)),
      }
    : null
  // I film fra cui comporre una saga: quelli riconosciuti di questa scheda,
  // uno per titolo (due versioni dello stesso film sono un titolo solo).
  const filmPerSaga = [
    ...new Map(
      film.flatMap((f) => {
        const k = chiaveTitolo(f.riga.id)
        const voce = archivio.get(f.video.id)
        return k
          ? [[k, { chiave: k, titolo: f.riga.nome, anno: f.riga.anno, poster: voce?.poster_path ? posterUrl(voce.poster_path, 'w185') : null }] as const]
          : []
      }),
    ).values(),
  ].sort((a, b) => a.titolo.localeCompare(b.titolo, 'it'))
  const sagaAperta = sagaInModifica?.listaId ? (raccolte.find((r) => r.id === sagaInModifica.listaId) ?? null) : null
  const righe = voci.map((f) => f.riga)
  const videoDi = new Map(voci.map((f) => [f.riga.id, f.video]))
  const generiScheda = generiPresenti(righe, nomiGeneri)
  // Un genere che in questa scheda non c'è (cambiando scheda) vale «tutti».
  const genereValido = genere !== null && generiScheda.some((g) => g.id === genere) ? genere : null
  const quantiDaSistemare = righe.filter((r) => r.daSistemare).length
  // Sistemato l'ultimo, il filtro si spegne da solo invece di lasciare un elenco vuoto.
  const filtroDaSistemare = soloDaSistemare && quantiDaSistemare > 0
  const elenco = ordinaVideoteca(filtraVideoteca(righe, { query, genere: genereValido, daSistemare: filtroDaSistemare }), ordine)

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
          video: gruppo.ids.map((id) => videoPerId.get(id) as DriveVideo),
        })
      }
      onScegliFile={(e) => {
        const v = videoPerId.get(e.id) as DriveVideo
        setScelta({ nome: e.nome, ricerca: filmDaCercare(v.name, v.cartella, v.serie ?? null).titolo, video: [v] })
      }}
      onCancella={() => void cancellaGruppo(gruppo.chiave, gruppo.titolo, gruppo.ids.map((id) => videoPerId.get(id) as DriveVideo))}
      cancellando={cancellando === gruppo.chiave}
    />
  )

  const rigaFilm = (v: DriveVideo, riga: RigaVideoteca) => (
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
      {cestinato && (
        <p role="status" className="mb-6 rounded-xl border border-theatre-800 bg-theatre-900/40 px-4 py-3 text-sm text-zinc-300">
          🗑 «{cestinato}» è nel cestino di Google Drive: da lì lo recuperi per 30 giorni.
        </p>
      )}

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
            riprodurli in streaming. I file restano su Drive: Ciak li legge, e sposta nel cestino
            solo quelli che gli dici di cancellare.
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
        {extra > 0 && (
          <p className="mb-3 text-sm text-zinc-500">
            {extra === 1 ? '1 extra (featurette, trailer, interviste…) non è in elenco' : `${extra} extra (featurette, trailer, interviste…) non sono in elenco`}
            : stanno nelle cartelle degli extra dei film, e non sono titoli da guardare.
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
          {quantiDaSistemare > 0 && (
            <button
              type="button"
              aria-pressed={filtroDaSistemare}
              onClick={() => setSoloDaSistemare((s) => !s)}
              className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                filtroDaSistemare ? 'border-projector/60 bg-projector/10 text-projector' : 'border-theatre-700 text-zinc-400 hover:text-zinc-100'
              }`}
            >
              ⚠ Da sistemare {quantiDaSistemare}
            </button>
          )}
          {filmPerSaga.length > 0 && (
            <button
              type="button"
              onClick={() => setSagaInModifica({ listaId: null })}
              className="rounded-lg border border-theatre-700 px-3 py-1.5 text-sm text-zinc-400 transition hover:text-zinc-100"
            >
              ＋ Crea una saga
            </button>
          )}
          {elenco.length !== righe.length && (
            <span className="text-sm text-zinc-500">
              {elenco.length} di {righe.length}
            </span>
          )}
        </div>
        {filtroDaSistemare && (
          <p className="mb-3 text-sm text-zinc-500">
            Titoli che Ciak non ha riconosciuto, senza copertina o con episodi che non sa dove mettere. Per un film premi ✎ (anche accanto a un file fra gli «Altri episodi»); per
            una serie aprila e premi «Scegli il titolo».
          </p>
        )}
        {raccolteScheda.length > 0 && !query.trim() && genereValido === null && !filtroDaSistemare && (
          <section className="mb-6" aria-label="Le mie raccolte">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-zinc-500">🗂️ Le mie raccolte</h2>
            {/* Una fila che scorre di lato, come le collezioni di TMDB. */}
            <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2">
              {raccolteScheda.map(({ raccolta, film: suoiFilm, serie: suoeSerie }) => (
                <RiquadroRaccolta
                  key={raccolta.id}
                  nome={raccolta.nome}
                  copertina={copertinaUrl(raccolta.copertina, 'w780')}
                  mosaico={[
                    ...suoiFilm.map((f) => archivio.get(f.video.id)?.poster_path),
                    ...suoeSerie.map((g) => g.posterPath),
                  ]
                    .filter((p): p is string => !!p)
                    .map((p) => posterUrl(p, 'w185') as string)}
                  quanti={suoiFilm.length + suoeSerie.length}
                  visti={suoiFilm.filter((f) => !!archivio.get(f.video.id)?.visto_il).length + suoeSerie.filter((g) => g.episodi.every((e) => e.visto)).length}
                  aperta={raccoltaAperta === raccolta.id}
                  onApri={() => setRaccoltaAperta((a) => (a === raccolta.id ? null : raccolta.id))}
                />
              ))}
            </div>
            {apertaQui && (
              <div className="mt-2 rounded-2xl border border-theatre-800 bg-theatre-900/40">
                <div className="flex flex-wrap items-center gap-3 border-b border-theatre-800 px-4 py-3">
                  <h3 className="flex-1 font-display text-xl tracking-wide text-zinc-100">{apertaQui.raccolta.nome}</h3>
                  <button type="button" onClick={() => setCopertinaDi(apertaQui.raccolta.id)} className="btn-ghost px-3 py-1.5 text-sm">
                    🖼️ Cambia copertina
                  </button>
                  <button type="button" onClick={() => setRaccoltaAperta(null)} aria-label="Chiudi la raccolta" className="px-2 text-zinc-500 hover:text-zinc-100">
                    ✕
                  </button>
                </div>
                <ul aria-label={`Titoli di ${apertaQui.raccolta.nome}`} className="divide-y divide-theatre-800">
                  {apertaQui.film.map((f) => (
                    <li key={f.video.id}>{rigaFilm(f.video, f.riga)}</li>
                  ))}
                  {apertaQui.serie.map((g) => (
                    <li key={g.chiave}>{rigaSerie(g)}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}
        {elenco.length === 0 ? (
          <EmptyState title="Nessun titolo" message="Nessun video corrisponde alla ricerca o al genere scelto." icon="🔍" />
        ) : (
        <ul aria-label="Video della videoteca" className="divide-y divide-theatre-800 rounded-2xl border border-theatre-800 bg-theatre-900/40">
          {elenco.map((riga) => {
            const gruppo = serie.get(riga.id)
            if (gruppo) {
              return (
                <li key={riga.id}>
                  {rigaSerie(gruppo)}
                </li>
              )
            }
            const saga = saghe.get(riga.id)
            if (saga) {
              const suoi = saga.ids.map((id) => filmPerId.get(id) as { riga: RigaVideoteca; video: DriveVideo })
              const anni = suoi.map((f) => f.riga.anno).filter((a): a is string => !!a)
              const primaLocandina = suoi.map((f) => archivio.get(f.video.id)?.poster_path).find((p): p is string => !!p) ?? null
              return (
                <li key={riga.id}>
                  <SagaVideoteca
                    nome={saga.saga.name}
                    poster={
                      // Fatta a mano: la copertina scelta, se no la locandina del primo film.
                      saga.saga.listaId
                        ? (copertinaUrl(saga.saga.copertina ?? null, 'w780') ?? posterUrl(primaLocandina, 'w185'))
                        : posterUrl(saga.saga.posterPath, 'w185')
                    }
                    azioni={
                      saga.saga.listaId ? (
                        <>
                          <button
                            type="button"
                            onClick={() => setSagaInModifica({ listaId: saga.saga.listaId as string })}
                            className="text-xs text-zinc-400 transition hover:text-projector"
                          >
                            ✎ Modifica la saga
                          </button>
                          <button type="button" onClick={() => setCopertinaDi(saga.saga.listaId as string)} className="text-xs text-zinc-400 transition hover:text-projector">
                            🖼️ Cambia copertina
                          </button>
                        </>
                      ) : undefined
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
                </li>
              )
            }
            return (
              <li key={riga.id}>{rigaFilm(videoDi.get(riga.id) as DriveVideo, riga)}</li>
            )
          })}
        </ul>
        )}
        </>
      )}

      {sagaInModifica && (
        <Modal
          title={sagaAperta ? `Saga «${sagaAperta.nome}»` : 'Crea una saga'}
          onClose={() => setSagaInModifica(null)}
        >
          <ModificaSaga
            film={filmPerSaga}
            iniziale={sagaAperta ? { nome: sagaAperta.nome, chiavi: sagaAperta.chiavi } : undefined}
            onSalva={(nome, chiavi) => void salvaSaga(nome, chiavi)}
            onSciogli={sagaAperta ? () => void sciogliSaga(sagaAperta.id, sagaAperta.nome) : undefined}
            salvando={salvandoSaga}
          />
        </Modal>
      )}
      {perCopertina && (
        <Modal title={`Copertina di «${perCopertina.raccolta.nome}»`} onClose={() => setCopertinaDi(null)}>
          <SceltaCopertina
            titoli={[
              ...perCopertina.film.flatMap((f) => {
                const voce = archivio.get(f.video.id)
                return voce?.tmdb_id ? [{ tmdbId: voce.tmdb_id, mediaType: 'movie' as const, titolo: f.riga.nome }] : []
              }),
              ...perCopertina.serie.flatMap((g) =>
                g.tmdb.startsWith('tv-') ? [{ tmdbId: Number(g.tmdb.slice(3)), mediaType: 'tv' as const, titolo: g.titolo }] : [],
              ),
            ]}
            attuale={perCopertina.raccolta.copertina}
            onScegli={(c) => void scegliCopertina(perCopertina.raccolta.id, c)}
          />
        </Modal>
      )}
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
