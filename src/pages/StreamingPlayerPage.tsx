import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ErrorState } from '../components/States'
import PannelloArchivio from '../components/PannelloArchivio'
import ProssimoEpisodio from '../components/ProssimoEpisodio'
import {
  anteprimaUrl,
  apriSuDriveUrl,
  ascoltaDiagnostica,
  attendiLettoreCiak,
  collegaDrive,
  erroreRitornoDrive,
  driveConnesso,
  flussoVideoUrl,
  idDriveValido,
  lettoreCiakDisponibile,
  scadenzaDrive,
  tieniSveglioIlLettore,
  titoloVideo,
  versioneWorker,
} from '../lib/googleDrive'
import {
  ATTESA_AVVIO_MS,
  decidiErrore,
  descriviDiagnostica,
  senzaAudio,
  sessioneInScadenza,
  vigilanzaSalto,
  type DiagnosticaVideo,
  type Problema,
} from '../lib/lettore'
import {
  annullaDownload,
  ascoltaFilmOffline,
  downloadInCorso,
  eliminaFilm,
  filmOffline,
  offlineDisponibile,
  salvaSottotitoliOffline,
  scaricaFilm,
  taglia,
  type Avanzamento,
  type FilmOffline,
} from '../lib/filmOffline'
import { registraErrore } from '../lib/errorLog'
import { logFailure } from '../lib/logFailure'
import { filmDaCercare, nomeLingua } from '../lib/sottotitoli'
import {
  DURATE_SIGLA,
  codaSiglaRaggiunta,
  dopoLaSigla,
  inSiglaFinale,
  inizioSiglaRaggiunto,
  leggiDurataSigla,
  leggiPuntiSigla,
  leggiSaltaSigle,
  mostraSaltaSigla,
  salvaDurataSigla,
  salvaPuntiSigla,
  salvaSaltaSigle,
  secondiAllaFine,
  type PuntiSigla,
  type SaltaSigle,
} from '../lib/sigle'
import { formattaTempo, titoloDaMostrare } from '../lib/streaming'
import { sigla } from '../lib/videoteca'
import { useArchivioStreaming } from '../lib/useArchivioStreaming'
import { useSottotitoli } from '../lib/useSottotitoli'

// Due lettori per lo stesso film:
//  - quello di Ciak, un <video> che legge il file originale da Drive (tramite
//    il service worker) o, se il film è stato scaricato, dal dispositivo — e
//    mostra i sottotitoli che Ciak trova da sé, in italiano e in inglese;
//  - quello di Google Drive, in un iframe, che converte al volo ogni formato
//    ma non accetta sottotitoli dall'esterno.
// Si parte da quello di Ciak; se il browser non legge il file o l'audio resta
// muto (tipico del Dolby E-AC3 negli MKV) lo si dice e si passa a Drive.

const MESSAGGI: Record<Problema, string> = {
  formato: 'Il browser non riesce a leggere questo file. Il lettore di Drive lo converte da sé.',
  muto: 'Il video parte ma senza audio: probabilmente è in un formato (come il Dolby E-AC3) che il browser non legge. Il lettore di Drive lo converte da sé.',
  sessione: 'La sessione Google è scaduta: ricollega Google Drive per continuare da dove eri.',
  rete: 'La connessione con Drive si è interrotta più volte di fila. Riprova tra poco, o usa il lettore di Drive.',
  avvio:
    "Il browser non riesce ad aprire questo file: capita spesso con gli MKV, che Chrome legge solo in parte. Il lettore di Drive lo converte da sé (ma senza i sottotitoli di Ciak).",
  salto: 'Il salto non è riuscito: Drive non ha mandato il pezzo di film richiesto. Riprova, o usa il lettore di Drive (i dettagli tecnici qui sotto dicono cosa ha risposto).',
}

// Un lettore per file: passando all'episodio dopo (stessa pagina, altro file)
// si riparte da zero, invece di trascinarsi posizione, errori e sottotitoli
// dell'episodio precedente.
export default function StreamingPlayerPage() {
  const { fileId = '' } = useParams()
  // Lo schermo intero vale per tutti gli episodi di fila, ma non per il resto
  // dell'app: uscendo dal lettore si torna alla finestra. Il Layout rifà la
  // pagina a ogni indirizzo, anche passando all'episodio dopo: si guarda dove
  // si sta andando (l'indirizzo è già quello nuovo quando si smonta).
  useEffect(
    () => () => {
      if (/^\/streaming\/[^/]+$/.test(window.location.pathname)) return
      if (document.fullscreenElement) document.exitFullscreen().catch(logFailure('Uscita dallo schermo intero'))
    },
    [],
  )
  return <LettoreStreaming key={fileId} />
}

function LettoreStreaming() {
  const { fileId = '' } = useParams()
  const stato = useLocation().state as { titolo?: string; file?: string } | null
  const valido = idDriveValido(fileId)

  // Il film sul dispositivo: undefined finché non si è guardato in cache.
  const [locale, setLocale] = useState<FilmOffline | null | undefined>(undefined)
  const [avanzamento, setAvanzamento] = useState<Avanzamento | null>(null)
  const [scaricando, setScaricando] = useState(false)
  const [erroreDownload, setErroreDownload] = useState<string | null>(null)
  const scaricato = locale?.stato === 'completo'

  const [connesso, setConnesso] = useState(driveConnesso)
  const [ciakPronto, setCiakPronto] = useState(lettoreCiakDisponibile)
  const [lettore, setLettore] = useState<'ciak' | 'drive'>(() =>
    lettoreCiakDisponibile() && driveConnesso() ? 'ciak' : 'drive',
  )
  // I sottotitoli si cercano su Drive solo quando serve davvero il lettore di
  // Ciak e il film non è già sul dispositivo coi suoi: nel lettore di Drive
  // non si vedrebbero, e un download online ha un tetto.
  const [sottotitoliAttivi, setSottotitoliAttivi] = useState(lettore === 'ciak')
  const [problema, setProblema] = useState<Problema | null>(null)
  const [chiaveVideo, setChiaveVideo] = useState(0)
  const [errore, setErrore] = useState<string | null>(null)
  // Un consenso a Drive andato male nell'app installata torna qui da Google:
  // lo si dice invece di riproporre il pulsante come se niente fosse.
  useEffect(() => {
    const e = erroreRitornoDrive()
    if (e) setErrore(e)
  }, [])
  const videoRef = useRef<HTMLVideoElement>(null)
  const navigate = useNavigate()
  // Lo schermo intero di Ciak è quello della pagina, non del <video>: passando
  // all'episodio dopo il <video> si rifà da capo, e col suo schermo intero si
  // tornava ogni volta alla finestra. E sopra il video restano visibili i
  // pulsanti per saltare le sigle.
  const [schermoIntero, setSchermoIntero] = useState(() => document.fullscreenElement === document.documentElement)
  useEffect(() => {
    const cambia = () => setSchermoIntero(document.fullscreenElement === document.documentElement)
    document.addEventListener('fullscreenchange', cambia)
    return () => document.removeEventListener('fullscreenchange', cambia)
  }, [])
  // Dove si è nell'episodio: all'inizio (si può saltare la sigla), nella sigla
  // finale, finito. Si aggiornano solo quando cambiano, non a ogni timeupdate.
  const [allInizio, setAllInizio] = useState(true)
  const [inCoda, setInCoda] = useState(false)
  const [finito, setFinito] = useState(false)
  const [siglaSaltata, setSiglaSaltata] = useState(false)
  // Le caselle «salta sempre»: valgono per tutte le serie.
  const [scelte, setScelte] = useState<SaltaSigle>(leggiSaltaSigle)
  // Saltata da sola: da dove, per poterci tornare se il punto era sbagliato.
  const [rivedi, setRivedi] = useState<number | null>(null)
  useEffect(() => {
    if (rivedi === null) return
    const via = setTimeout(() => setRivedi(null), 8000)
    return () => clearTimeout(via)
  }, [rivedi])
  // Il conto alla rovescia partito dalla sigla finale, senza aspettare la fine.
  const [codaAutomatica, setCodaAutomatica] = useState(false)
  const posizione = useRef(0)
  const audioControllato = useRef(false)
  // Chi ha scelto a mano il lettore di Drive ci resta, anche se quello di Ciak
  // diventa pronto dopo.
  const sceltaDrive = useRef(false)
  // Riprese automatiche dopo un errore di rete, e da che punto è partita l'ultima:
  // il conto si azzera quando il film torna a scorrere per un po'.
  const tentativi = useRef(0)
  const ripresoDa = useRef(0)
  // Da dove ripartire al prossimo caricamento (errore, ricollegamento). Non si
  // può leggere `posizione` in quel momento: `load()` azzera il tempo e manda
  // un timeupdate a 0 prima di loadedmetadata, e il film ripartiva da capo.
  const daRiprendere = useRef(0)
  // Cosa ha risposto Drive agli ultimi pezzi di film, dal service worker.
  const [diagnostica, setDiagnostica] = useState<DiagnosticaVideo[]>([])
  // undefined: non ancora chiesta; null: il worker non risponde (vecchio o assente).
  const [versione, setVersione] = useState<string | null | undefined>(undefined)
  const [inScadenza, setInScadenza] = useState(false)
  const vigilanza = useRef(vigilanzaSalto(() => segnala('salto')))
  // Lo stesso guardiano per l'avvio: se i metadati non arrivano, il film non
  // partirà — e il browser non lo dice.
  const vigilanzaAvvio = useRef(vigilanzaSalto(() => segnala('avvio'), ATTESA_AVVIO_MS))
  useEffect(
    () => () => {
      vigilanza.current.fine()
      vigilanzaAvvio.current.fine()
    },
    [],
  )
  useEffect(() => {
    if (lettore !== 'ciak') return vigilanzaAvvio.current.fine()
    vigilanzaAvvio.current.inizio()
  }, [lettore, chiaveVideo])

  // Il film scaricato si guarda col lettore di Ciak anche senza Drive: è il
  // caso in cui serve di più (in giro, senza rete).
  useEffect(() => {
    if (!valido) return
    let attivo = true
    void filmOffline(fileId).then((f) => {
      if (!attivo) return
      setLocale(f)
      if (f?.stato === 'completo' && lettoreCiakDisponibile() && !sceltaDrive.current) setLettore('ciak')
    })
    return () => {
      attivo = false
    }
  }, [fileId, valido])

  useEffect(
    () =>
      ascoltaFilmOffline((evento) => {
        if (evento.id !== fileId) return
        if (evento.avanzamento) setAvanzamento(evento.avanzamento)
        if (evento.stato !== 'in-corso') {
          setAvanzamento(null)
          void filmOffline(fileId).then(setLocale)
        }
      }),
    [fileId],
  )

  useEffect(
    () =>
      attendiLettoreCiak(() => {
        setCiakPronto(true)
        if (!sceltaDrive.current && (driveConnesso() || scaricato)) {
          setLettore('ciak')
          setSottotitoliAttivi(true)
        }
      }),
    [scaricato],
  )

  useEffect(() => (lettore === 'ciak' ? tieniSveglioIlLettore() : undefined), [lettore])
  useEffect(() => ascoltaDiagnostica((d) => setDiagnostica((prima) => [...prima.slice(-7), d])), [])
  useEffect(() => {
    if (lettore !== 'ciak') return
    let attivo = true
    void versioneWorker().then((v) => attivo && setVersione(v))
    return () => {
      attivo = false
    }
  }, [lettore, ciakPronto])

  // Coi sottotitoli già salvati insieme al film, Drive non serve: si usano
  // quelli. Altrimenti (o se si vuole cambiarli) li si cerca come sempre.
  const usaSalvati = scaricato && !connesso && (locale?.sottotitoli?.length ?? 0) > 0
  const sub = useSottotitoli(fileId, valido && connesso && sottotitoliAttivi && !usaSalvati)

  const tracceSalvate = useMemo(() => {
    if (!usaSalvati || !locale?.sottotitoli) return []
    return locale.sottotitoli.map((s) => ({
      ...s,
      url: URL.createObjectURL(new Blob([s.vtt], { type: 'text/vtt' })),
    }))
  }, [usaSalvati, locale])
  useEffect(() => () => tracceSalvate.forEach((t) => URL.revokeObjectURL(t.url)), [tracceSalvate])

  const tracce = usaSalvati ? tracceSalvate : sub.tracce

  // Il legame con l'archivio: quale titolo è, dove ci si era fermati, e a fine
  // visione «visto» nel diario (o l'episodio spuntato) e il voto.
  const archivio = useArchivioStreaming(fileId, valido)
  const { caricata: archivioCaricato, applicaRipresa, prossimo } = archivio
  const serie = archivio.voce?.media_type === 'tv' && archivio.voce.tmdb_id ? `tv-${archivio.voce.tmdb_id}` : null
  const [durataSigla, setDurataSigla] = useState<number | null>(null)
  useEffect(() => setDurataSigla(serie ? leggiDurataSigla(serie) : null), [serie])
  const [punti, setPunti] = useState<PuntiSigla>({ inizio: null, coda: null })
  useEffect(() => setPunti(serie ? leggiPuntiSigla(serie) : { inizio: null, coda: null }), [serie])
  // Si salva subito, non dentro l'aggiornamento dello stato: passando
  // all'episodio dopo la pagina sparisce prima che quello venga eseguito.
  const imparaPunti = useCallback(
    (nuovi: Partial<PuntiSigla>) => {
      if (!serie) return
      const aggiornati = { ...punti, ...nuovi }
      salvaPuntiSigla(serie, aggiornati)
      setPunti(aggiornati)
    },
    [serie, punti],
  )
  const etichettaProssimo = prossimo ? sigla(prossimo) : null
  const vaiAlProssimo = useCallback(() => {
    if (!prossimo) return
    navigate(`/streaming/${prossimo.drive_file_id}`, {
      state: { titolo: titoloDaMostrare(prossimo) ?? undefined, file: prossimo.nome_file ?? undefined },
    })
  }, [navigate, prossimo])
  // Premuto a mano durante la sigla finale: quanto mancava alla fine è dove
  // comincia la sigla finale di questa serie, per saltarla da sola.
  const prossimoDallaSigla = useCallback(() => {
    const v = videoRef.current
    if (v && !finito && !codaAutomatica) {
      const coda = secondiAllaFine(v.currentTime, Number.isFinite(v.duration) ? v.duration : null)
      if (coda !== null) imparaPunti({ coda })
    }
    vaiAlProssimo()
  }, [finito, codaAutomatica, imparaPunti, vaiAlProssimo])
  useEffect(() => {
    const v = videoRef.current
    if (archivioCaricato && v && v.readyState >= 1) applicaRipresa(v)
  }, [archivioCaricato, applicaRipresa, chiaveVideo])

  // I sottotitoli trovati dopo il download, o cambiati, raggiungono la scheda
  // del film sul dispositivo: offline si vedono quelli.
  useEffect(() => {
    if (!locale || usaSalvati || sub.tracce.length === 0) return
    void salvaSottotitoliOffline(
      fileId,
      sub.tracce.map(({ chiave, lingua, etichetta, vtt }) => ({ chiave, lingua, etichetta, vtt })),
    ).catch(logFailure('Sottotitoli nella scheda del film offline'))
  }, [fileId, locale, usaSalvati, sub.tracce])

  // Le tracce aggiunte a video già avviato non si accendono da sole: la prima
  // (l'italiano, se c'è) si accende a mano, le altre restano disponibili dal
  // pulsante CC. Se l'utente ne ha già scelta una, non la si tocca.
  useEffect(() => {
    const elenco = videoRef.current?.textTracks
    if (!elenco || tracce.length === 0) return
    let mostrata = false
    for (let i = 0; i < elenco.length; i++) if (elenco[i].mode === 'showing') mostrata = true
    if (mostrata) return
    for (let i = 0; i < elenco.length; i++) elenco[i].mode = i === 0 ? 'showing' : 'hidden'
  }, [tracce, chiaveVideo])

  const titolo =
    stato?.titolo ??
    locale?.titolo ??
    (archivio.voce ? titoloDaMostrare(archivio.voce) : null) ??
    (sub.info ? titoloVideo({ name: sub.info.name, cartella: sub.cartella, serie: sub.serie }) : 'Film')
  const nomeFile = stato?.file ?? locale?.file ?? sub.info?.name

  const indietro = (
    <Link to="/streaming" className="text-sm text-zinc-400 transition hover:text-projector">
      ← Torna ai film
    </Link>
  )

  if (!valido) {
    return (
      <div className="space-y-4">
        {indietro}
        <ErrorState title="Film non trovato" message="L'indirizzo di questo film non è valido." />
      </div>
    )
  }

  function usaDrive() {
    sceltaDrive.current = true
    vigilanza.current.fine()
    setLettore('drive')
    setProblema(null)
  }

  function usaCiak() {
    sceltaDrive.current = false
    audioControllato.current = false
    setLettore('ciak')
    setSottotitoliAttivi(true)
    setProblema(null)
  }

  // Un avviso dentro la pagina non si vede in schermo intero: prima si esce.
  function segnala(p: Problema) {
    setProblema(p)
    if (document.fullscreenElement) document.exitFullscreen().catch(logFailure('Uscita dallo schermo intero'))
  }

  function alternaSchermoIntero() {
    if (document.fullscreenElement) document.exitFullscreen().catch(logFailure('Uscita dallo schermo intero'))
    else document.documentElement.requestFullscreen().catch(logFailure('Schermo intero del lettore'))
  }

  // A mano insegna anche dove comincia la sigla in questa serie; da sola
  // (`automatica`) lascia per qualche secondo «↩ Rivedi la sigla».
  function saltaSigla(automatica = false) {
    const v = videoRef.current
    if (!v || durataSigla === null) return
    const da = v.currentTime
    v.currentTime = dopoLaSigla(da, durataSigla, Number.isFinite(v.duration) ? v.duration : null)
    setSiglaSaltata(true)
    if (automatica) setRivedi(da)
    else imparaPunti({ inizio: Math.round(da) })
  }

  function cambiaScelte(nuove: Partial<SaltaSigle>) {
    const aggiornate = { ...scelte, ...nuove }
    salvaSaltaSigle(aggiornate)
    setScelte(aggiornate)
  }

  function suErrore(v: HTMLVideoElement) {
    const decisione = decidiErrore({
      codice: v.error?.code,
      posizione: posizione.current,
      tentativi: tentativi.current,
      connesso: driveConnesso() || scaricato,
    })
    // Nel diario, con le ultime risposte di Drive: un errore del lettore che
    // resta solo a schermo non si può più indagare.
    void registraErrore('lettore: errore video', {
      codice: v.error?.code,
      messaggio: v.error?.message,
      posizione: posizione.current,
      decisione,
      scaricato,
      drive: diagnostica.slice(-3),
    })
    if (decisione !== 'riprova') return segnala(decisione)
    // Stesso elemento, nuova richiesta: si riprende da dove si era (vedi
    // onLoadedMetadata) senza uscire dallo schermo intero.
    tentativi.current++
    ripresoDa.current = posizione.current
    daRiprendere.current = posizione.current
    v.load()
  }

  function riprova() {
    tentativi.current = 0
    daRiprendere.current = posizione.current
    setProblema(null)
    videoRef.current?.load()
  }

  async function ricollega() {
    setErrore(null)
    try {
      await collegaDrive()
      setConnesso(true)
      // Un rinnovo a film in corso non deve interromperlo: il service worker
      // chiede il token a ogni richiesta e prende da sé quello nuovo. Solo un
      // video già fermo per la sessione scaduta va ricaricato.
      if (problema) {
        daRiprendere.current = posizione.current
        setChiaveVideo((k) => k + 1)
      }
      setProblema(null)
      setInScadenza(false)
      tentativi.current = 0
      if (ciakPronto || lettoreCiakDisponibile()) usaCiak()
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Collegamento non riuscito.')
    }
  }

  async function scarica() {
    setErroreDownload(null)
    setScaricando(true)
    try {
      const esito = await scaricaFilm(
        { id: fileId, titolo, file: nomeFile ?? titolo, dimensione: sub.info?.size ?? null },
        sub.tracce.map(({ chiave, lingua, etichetta, vtt }) => ({ chiave, lingua, etichetta, vtt })),
      )
      if (esito === 'sottofondo') setLocale(await filmOffline(fileId))
    } catch (e) {
      setErroreDownload(e instanceof Error ? e.message : 'Download non riuscito.')
      logFailure('Download del film per l’offline')(e)
    } finally {
      setScaricando(false)
    }
  }

  async function elimina() {
    await eliminaFilm(fileId).catch(logFailure('Eliminazione del film offline'))
    setLocale(null)
  }

  const testoSottotitoli =
    sub.stato === 'cerco' && !usaSalvati
      ? 'Cerco i sottotitoli…'
      : tracce.length > 0
        ? // Le tracce trovate e, se una lingua manca, anche questo: altrimenti
          // chi cerca l'inglese non capisce perché non c'è.
          [tracce.map((t) => t.etichetta).join(' · '), !usaSalvati && sub.messaggio].filter(Boolean).join(' · ')
        : sub.stato === 'errore'
          ? `Sottotitoli non disponibili: ${sub.messaggio ?? 'errore sconosciuto'}`
          : (sub.messaggio ?? 'Nessun sottotitolo, né nella cartella né su OpenSubtitles.')

  const inCorso = scaricando || locale?.stato === 'in-corso' || downloadInCorso(fileId)

  return (
    <div className="space-y-4">
      {indietro}
      <div>
        <h1 className="font-display text-3xl tracking-wide text-zinc-100">{titolo}</h1>
        {nomeFile && nomeFile !== titolo && <p className="mt-1 truncate text-xs text-zinc-500">{nomeFile}</p>}
      </div>

      <div
        className={
          lettore === 'ciak' && schermoIntero
            ? 'fixed inset-0 z-[100] bg-black'
            : 'relative aspect-video w-full overflow-hidden rounded-xl bg-black shadow-reel'
        }
      >
        {lettore === 'ciak' ? (
          <video
            key={chiaveVideo}
            ref={videoRef}
            src={flussoVideoUrl(fileId)}
            controls
            // Lo schermo intero del <video> si perderebbe a ogni episodio: c'è
            // quello di Ciak (⛶ in alto a destra). Firefox il pulsante lo mostra
            // comunque.
            controlsList="nofullscreen"
            autoPlay
            playsInline
            aria-label={titolo}
            className="h-full w-full"
            onError={(e) => suErrore(e.currentTarget)}
            onLoadedMetadata={(e) => {
              vigilanzaAvvio.current.fine()
              // Dopo un'interruzione o un ricollegamento si riparte da dove si era.
              const v = e.currentTarget
              if (daRiprendere.current > 0) {
                v.currentTime = daRiprendere.current
                daRiprendere.current = 0
                v.play().catch(logFailure('Ripresa del film'))
              } else {
                // Prima apertura: dal punto in cui ci si era fermati l'ultima volta.
                archivio.applicaRipresa(v)
              }
            }}
            onPause={() => archivio.suPausa()}
            onEnded={() => setFinito(true)}
            onPlay={() => setFinito(false)}
            // Un salto fallito riprende dal punto scelto, non da quello di prima;
            // uno che non finisce mai viene segnalato.
            onSeeking={(e) => {
              posizione.current = e.currentTarget.currentTime
              vigilanza.current.inizio()
            }}
            onSeeked={() => vigilanza.current.fine()}
            onPlaying={() => vigilanza.current.fine()}
            onTimeUpdate={(e) => {
              const v = e.currentTarget
              posizione.current = v.currentTime
              archivio.suTempo(v)
              const inizio = mostraSaltaSigla(v.currentTime)
              if (inizio !== allInizio) setAllInizio(inizio)
              const durataVideo = Number.isFinite(v.duration) ? v.duration : null
              const coda = inSiglaFinale(v.currentTime, durataVideo)
              if (coda !== inCoda) setInCoda(coda)
              if (scelte.inizio && !siglaSaltata && inizioSiglaRaggiunto(v.currentTime, punti.inizio)) saltaSigla(true)
              // Dalla sigla finale parte il conto alla rovescia; tornando
              // indietro si ferma, invece di cambiare episodio a metà scena.
              const nellaCoda = scelte.fine && !!prossimo && codaSiglaRaggiunta(v.currentTime, durataVideo, punti.coda)
              if (nellaCoda !== codaAutomatica) setCodaAutomatica(nellaCoda)
              if (tentativi.current > 0 && v.currentTime > ripresoDa.current + 30) tentativi.current = 0
              const scade = !scaricato && sessioneInScadenza(scadenzaDrive(), Date.now())
              if (scade !== inScadenza) setInScadenza(scade)
              if (!audioControllato.current && v.currentTime >= 3) {
                audioControllato.current = true
                if (senzaAudio(v)) setProblema('muto')
              }
            }}
          >
            {tracce.map((t, i) => (
              <track
                key={t.url}
                kind="subtitles"
                src={t.url}
                srcLang={t.lingua ?? undefined}
                label={nomeLingua(t.lingua)}
                default={i === 0}
              />
            ))}
          </video>
        ) : (
          <iframe
            title={titolo}
            src={anteprimaUrl(fileId)}
            allow="autoplay; fullscreen"
            allowFullScreen
            className="h-full w-full border-0"
          />
        )}
        {lettore === 'ciak' && (
          // In alto a destra: in basso ci sono i comandi del browser, e quelli
          // di Firefox (play grande, salti di 10 secondi, velocità) sono alti
          // il doppio di quelli di Chrome e coprivano «Salta sigla».
          <div className="absolute right-2 top-2 flex flex-col items-end gap-2">
            <button
              type="button"
              onClick={alternaSchermoIntero}
              aria-label={schermoIntero ? 'Esci dallo schermo intero' : 'Schermo intero'}
              title={schermoIntero ? 'Esci dallo schermo intero' : 'Schermo intero'}
              className="rounded-lg bg-black/50 px-2 py-1 text-lg text-zinc-200 opacity-70 transition hover:opacity-100"
            >
              ⛶
            </button>
            {durataSigla !== null && allInizio && !siglaSaltata && !finito && (
              <button type="button" onClick={() => saltaSigla()} className="rounded-xl bg-theatre-950/90 px-3 py-1.5 text-sm text-zinc-100 shadow-reel">
                ⏭ Salta sigla
              </button>
            )}
            {rivedi !== null && (
              <button
                type="button"
                onClick={() => {
                  if (videoRef.current) videoRef.current.currentTime = rivedi
                  setRivedi(null)
                }}
                className="rounded-xl bg-theatre-950/90 px-3 py-1.5 text-sm text-zinc-100 shadow-reel"
              >
                ↩ Rivedi la sigla
              </button>
            )}
            {etichettaProssimo && (inCoda || finito || codaAutomatica) && (
              <ProssimoEpisodio
                etichetta={etichettaProssimo}
                finito={finito || codaAutomatica}
                onVai={prossimoDallaSigla}
              />
            )}
          </div>
        )}
      </div>

      {lettore === 'ciak' && serie && durataSigla !== null && (
        <div className="space-y-2 text-sm text-zinc-400">
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={scelte.inizio} onChange={(e) => cambiaScelte({ inizio: e.target.checked })} />
              Salta sempre la sigla iniziale
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={scelte.fine} onChange={(e) => cambiaScelte({ fine: e.target.checked })} />
              Salta anche la sigla finale
            </label>
          </div>
          {/* Dove stanno le sigle lo si impara da chi le salta a mano. */}
          {scelte.inizio && punti.inizio === null && (
            <p className="text-xs text-zinc-500">
              La prima volta premi «⏭ Salta sigla» quando parte: Ciak ricorda il punto e negli episodi dopo la salta da sola.
            </p>
          )}
          {scelte.fine && punti.coda === null && (
            <p className="text-xs text-zinc-500">
              La prima volta premi «⏭ Prossimo episodio» quando parte la sigla finale: Ciak ricorda il punto per questa serie.
            </p>
          )}
          <label className="flex flex-wrap items-center gap-2">
            ⏭ «Salta sigla» va avanti di
            <select
              value={durataSigla}
              onChange={(e) => {
                const secondi = Number(e.target.value)
                setDurataSigla(secondi)
                salvaDurataSigla(serie, secondi)
              }}
              aria-label="Durata della sigla"
              className="rounded-lg border border-theatre-800 bg-theatre-900 px-2 py-1 text-zinc-200"
            >
              {DURATE_SIGLA.map((d) => (
                <option key={d} value={d}>
                  {formattaTempo(d)}
                </option>
              ))}
            </select>
            in tutti gli episodi di questa serie.
          </label>
        </div>
      )}

      {problema && lettore === 'ciak' && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-projector/40 bg-projector/10 p-4 text-sm text-zinc-200">
          <p className="flex-1">{MESSAGGI[problema]}</p>
          {problema === 'sessione' ? (
            <button type="button" onClick={ricollega} className="btn-primary px-3 py-2">
              Ricollega Google Drive
            </button>
          ) : problema === 'rete' || problema === 'salto' ? (
            <>
              <button type="button" onClick={riprova} className="btn-primary px-3 py-2">
                Riprova
              </button>
              <button type="button" onClick={usaDrive} className="btn-ghost px-3 py-2">
                Usa il lettore di Drive
              </button>
            </>
          ) : (
            <button type="button" onClick={usaDrive} className="btn-primary px-3 py-2">
              Usa il lettore di Drive
            </button>
          )}
        </div>
      )}
      {inScadenza && !problema && lettore === 'ciak' && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-theatre-800 bg-theatre-900/40 p-3 text-sm text-zinc-300">
          <p className="flex-1">
            La sessione Google sta per scadere e il film si fermerebbe: rinnovala ora, riprende da dove sei.
          </p>
          <button type="button" onClick={ricollega} className="btn-ghost px-3 py-1.5">
            Rinnova la sessione Google
          </button>
        </div>
      )}
      {errore && <p className="text-sm text-red-400">{errore}</p>}

      {archivio.caricata && (
        <PannelloArchivio
          voce={archivio.voce}
          nome={filmDaCercare(nomeFile ?? titolo, sub.cartella, sub.serie)}
          ripresoDa={archivio.ripresoDa}
          visto={archivio.visto}
          votoSalvato={archivio.votoSalvato}
          errore={archivio.erroreArchivio}
          prossimo={archivio.prossimo}
          onRicomincia={() => {
            if (videoRef.current) videoRef.current.currentTime = 0
          }}
          onVota={(voto) => void archivio.vota(voto)}
          onCambia={archivio.cambiaAbbinamento}
        />
      )}

      {/* Sul dispositivo: scaricare, avanzamento, eliminare. */}
      {offlineDisponibile() && locale !== undefined && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-theatre-800 bg-theatre-900/40 p-3 text-sm">
          {scaricato ? (
            <>
              <p className="flex-1 text-zinc-300">
                📱 Scaricato sul dispositivo{locale?.dimensione ? ` (${taglia(locale.dimensione)})` : ''}: si vede anche
                offline, e i salti sono istantanei.
              </p>
              <button type="button" onClick={elimina} className="btn-ghost px-3 py-1.5">
                Elimina dal dispositivo
              </button>
            </>
          ) : inCorso ? (
            <>
              <p className="flex-1 text-zinc-300">
                ⬇️ Download in corso
                {avanzamento
                  ? `: ${taglia(avanzamento.ricevuti)}${avanzamento.totale ? ` di ${taglia(avanzamento.totale)}` : ''}`
                  : locale?.stato === 'in-corso' && !downloadInCorso(fileId)
                    ? ' in sottofondo: puoi chiudere Ciak, ti avvisa quando è pronto.'
                    : '…'}
              </p>
              {downloadInCorso(fileId) && (
                <button type="button" onClick={() => annullaDownload(fileId)} className="btn-ghost px-3 py-1.5">
                  Annulla
                </button>
              )}
            </>
          ) : (
            <>
              <p className="flex-1 text-zinc-400">
                {locale?.stato === 'errore'
                  ? `L'ultimo download non è riuscito${locale.errore ? ` (${locale.errore})` : ''}.`
                  : 'Scaricalo sul dispositivo per vederlo anche senza rete, in giro.'}
              </p>
              <button type="button" onClick={scarica} disabled={!connesso || !ciakPronto} className="btn-primary px-3 py-1.5">
                Scarica per l'offline
              </button>
            </>
          )}
          {erroreDownload && <p className="w-full text-red-400">{erroreDownload}</p>}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {lettore === 'ciak' && (
          <>
            <p className="text-zinc-300">💬 {testoSottotitoli}</p>
            {!usaSalvati &&
              sub.stato === 'pronti' &&
              sub.tracce
                .filter((t) => sub.altri[t.chiave])
                .map((t) => (
                  <button
                    key={t.chiave}
                    type="button"
                    onClick={() => sub.provaAltro(t.chiave)}
                    className="btn-ghost px-3 py-1.5"
                  >
                    {nomeLingua(t.lingua)} fuori sincrono? Prova un altro
                  </button>
                ))}
          </>
        )}
        <span className="flex-1" />
        {lettore === 'ciak' ? (
          <button type="button" onClick={usaDrive} className="btn-ghost px-3 py-1.5">
            Usa il lettore di Drive
          </button>
        ) : !connesso && !scaricato ? (
          <button type="button" onClick={ricollega} className="btn-ghost px-3 py-1.5">
            Collega Google Drive per i sottotitoli
          </button>
        ) : ciakPronto ? (
          <button type="button" onClick={usaCiak} className="btn-ghost px-3 py-1.5">
            Usa il lettore di Ciak (con sottotitoli)
          </button>
        ) : (
          <>
            <p className="text-zinc-400">
              Il lettore di Ciak, quello con i sottotitoli, non è ancora attivo in questa scheda.
            </p>
            <button type="button" onClick={() => window.location.reload()} className="btn-ghost px-3 py-1.5">
              Ricarica la pagina
            </button>
          </>
        )}
      </div>

      {lettore === 'ciak' && (
        <details className="rounded-xl border border-theatre-800 bg-theatre-900/40 px-4 py-2 text-xs text-zinc-400">
          <summary className="cursor-pointer text-zinc-300">Dettagli tecnici (cosa risponde Drive)</summary>
          <ul className="mt-2 space-y-1 font-mono">
            <li>
              {versione === undefined
                ? 'Service worker: …'
                : versione === null
                  ? 'Service worker: non risponde (versione vecchia o assente: ricarica la pagina)'
                  : `Service worker: ${versione}`}
            </li>
            {diagnostica.length === 0 && <li>Nessuna richiesta a Drive registrata finora.</li>}
            {diagnostica.map((d, i) => (
              <li key={`${d.quando}-${i}`}>{descriviDiagnostica(d)}</li>
            ))}
          </ul>
        </details>
      )}

      <div className="grid gap-3 text-sm text-zinc-400 sm:grid-cols-2">
        {lettore === 'ciak' ? (
          <>
            <div className="rounded-xl border border-theatre-800 bg-theatre-900/40 p-4">
              <p className="mb-1 font-medium text-zinc-200">📺 Il lettore di Ciak</p>
              <p>
                Legge il file originale, alla sua qualità piena, anche appena caricato. I sottotitoli
                (italiano e inglese) si scelgono dal pulsante CC del lettore; ⛶ per lo schermo intero.
              </p>
            </div>
            <div className="rounded-xl border border-theatre-800 bg-theatre-900/40 p-4">
              <p className="mb-1 font-medium text-zinc-200">💬 Da dove arrivano i sottotitoli</p>
              <p>
                Prima un file <code>.srt</code> accanto al film nella cartella su Drive; se manca una
                lingua, OpenSubtitles, e quello trovato viene salvato nella cartella per la volta dopo.
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="rounded-xl border border-theatre-800 bg-theatre-900/40 p-4">
              <p className="mb-1 font-medium text-zinc-200">📺 Il lettore di Drive</p>
              <p>
                Usa ⛶ per lo schermo intero e l'ingranaggio ⚙ per la qualità. I file appena caricati
                non partono finché Google non ha finito di elaborarli.
              </p>
            </div>
            <div className="rounded-xl border border-theatre-800 bg-theatre-900/40 p-4">
              <p className="mb-1 font-medium text-zinc-200">💬 Sottotitoli</p>
              <p>
                Il lettore di Drive mostra solo i sottotitoli caricati sul file: apri il film su Drive,
                poi ⋮ → <em>Gestisci tracce dei sottotitoli</em> → aggiungi il file <code>.srt</code>.
                Qui li attivi col pulsante CC.{' '}
                <a
                  href={apriSuDriveUrl(fileId)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-projector hover:underline"
                >
                  Apri su Drive ↗
                </a>
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
