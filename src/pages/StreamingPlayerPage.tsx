import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ErrorState } from '../components/States'
import PannelloArchivio from '../components/PannelloArchivio'
import MenuSottotitoli from '../components/MenuSottotitoli'
import MenuAudio from '../components/MenuAudio'
import SottotitoliVideo from '../components/SottotitoliVideo'
import BarraLettore from '../components/BarraLettore'
import IndicatoreCaricamento from '../components/IndicatoreCaricamento'
import AvvisoRipresa from '../components/AvvisoRipresa'
import SigleSerie from '../components/SigleSerie'
import {
  DIMENSIONI_SOTTOTITOLI,
  indiceSottotitolo,
  leggiDimensioneSottotitoli,
  leggiLinguaSottotitoli,
  linguaTraccia,
  salvaDimensioneSottotitoli,
  salvaLinguaSottotitoli,
} from '../lib/sceltaSottotitoli'
import { useComandiVisibili } from '../lib/useComandiVisibili'
import ProssimoEpisodio from '../components/ProssimoEpisodio'
import ToccoVideo from '../components/ToccoVideo'
import { azioneTasto, metadatiSessione, SALTO_TASTIERA, type AzioneTasto } from '../lib/comandiLettore'
import { idFileValido, titoloVideo } from '../lib/fileVideo'
import { ATTESA_AVVIO_MS, rilasciaVideo, senzaAudio, TENTATIVI_MAX, vigilanzaSalto, type Problema } from '../lib/lettore'
import {
  ascoltaFilmOffline,
  eliminaFilm,
  filmOffline,
  offlineDisponibile,
  salvaFileSulDispositivo,
  salvaSottotitoliOffline,
  taglia,
  urlFilmSalvato,
  type FilmOffline,
} from '../lib/filmOffline'
import { registraErrore } from '../lib/errorLog'
import { logFailure } from '../lib/logFailure'
import { filmDaCercare, nomeLingua } from '../lib/sottotitoli'
import {
  PUNTI_VUOTI,
  arrivoSalto,
  fineDaCorrezione,
  codaSiglaRaggiunta,
  durataDaPunti,
  inSiglaFinale,
  inizioSiglaRaggiunto,
  leggiDurataSigla,
  leggiPuntiSigla,
  leggiSaltaSigle,
  pulsanteSigla,
  DURATA_SIGLA_PREDEFINITA,
  salvaPuntiSigla,
  salvaSaltaSigle,
  secondiAllaFine,
  type PuntiSigla,
  type Salto,
  type SaltaSigle,
} from '../lib/sigle'
import { sigleEpisodio, type SigleEpisodio } from '../lib/sigleOnline'
import { formattaTempo, titoloDaMostrare } from '../lib/streaming'
import { sigla } from '../lib/videoteca'
import { useArchivioStreaming } from '../lib/useArchivioStreaming'
import { useSottotitoli } from '../lib/useSottotitoli'
import { useTracceAudio } from '../lib/useTracceAudio'
import { useElementoVideo } from '../lib/useElementoVideo'
import { collegaAudio } from '../lib/sincroniaAudio'
import { indiceAudio, leggiLinguaAudio, nomiTracceAudio, salvaLinguaAudio, siglaTracciaAudio, type TracciaAudio } from '../lib/tracceAudio'
import { eJellyfin, fermaConversione, flussoDiretto, flussoHls, riproducibileDirettamente, tracciaPredefinita } from '../lib/jellyfin'
import { useHls, useInfoCasa, useSottotitoliCasa } from '../lib/useLettoreCasa'
import { eLocale, filmAperto, formatoLeggibile, type FilmAperto } from '../lib/filmLocali'
import { ErroreCartella, cancellaDalDisco, cancellabileDalDisco, cartellaCollegata, cartellaScelta, fileDallaCartella } from '../lib/cartellaLocale'
import ScegliCartella from '../components/ScegliCartella'
import ApriFilmLocale from '../components/ApriFilmLocale'

// Il lettore di Ciak: un <video> che legge il file dal disco (la cartella
// collegata, un file scelto a mano o la copia salvata in Ciak) o dal server di
// casa, coi sottotitoli che Ciak trova da sé e le lingue dell'audio. Se il
// browser non legge il file, o l'audio resta muto (il Dolby E-AC3 degli MKV),
// lo si dice col rimedio: convertirlo con prepara-ciak.

const MESSAGGI: Record<Problema, string> = {
  formato: 'Il browser non riesce a leggere questo file: potrebbe essere rovinato, o in un formato che non conosce. Convertilo in MP4 con prepara-ciak.',
  muto: 'Il video parte ma senza audio: è in un formato (come il Dolby E-AC3) che il browser non legge. Convertilo con prepara-ciak, che rifà l’audio in AAC.',
  rete: 'Il video si è interrotto più volte di fila. Riprova tra poco.',
  avvio: 'Il film non parte: il browser forse non ne legge il formato. Convertilo in MP4 con prepara-ciak e riaprilo.',
  salto: 'Il salto non è riuscito: riprova.',
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
  const stato = useLocation().state as { titolo?: string; file?: string; aperto?: number } | null
  const valido = idFileValido(fileId)
  // Un video del server di casa (Jellyfin): il file arriva dal server, così
  // com'è o convertito al volo.
  const casa = eJellyfin(fileId)
  const { info: infoCasa, errore: erroreCasa } = useInfoCasa(fileId, casa && valido)
  // Un film aperto dal dispositivo (vedi filmLocali): il file scelto dal disco
  // in questa visita, quello della cartella collegata (cartellaLocale), oppure
  // la copia salvata in Ciak. Si rilegge quando lo si sceglie di nuovo dalla
  // pagina stessa (`stato.aperto` cambia) o si riapre la cartella.
  const loc = eLocale(fileId)
  const [aperto, setAperto] = useState<FilmAperto | undefined>(() => (loc ? filmAperto(fileId) : undefined))
  // Finché la cartella collegata non ha risposto non si chiede di scegliere il file.
  const [cercatoInCartella, setCercatoInCartella] = useState(() => !loc || !cartellaCollegata())
  const [cartellaDaRiaprire, setCartellaDaRiaprire] = useState(false)
  const [riaperta, setRiaperta] = useState(0)
  useEffect(() => {
    if (!loc) return
    const subito = filmAperto(fileId)
    if (subito) {
      setAperto(subito)
      setCercatoInCartella(true)
      return
    }
    if (!cartellaCollegata()) return setCercatoInCartella(true)
    let vivo = true
    fileDallaCartella(fileId)
      .then((f) => {
        if (!vivo) return
        if (f) setAperto(f)
        setCartellaDaRiaprire(false)
      })
      .catch((e: unknown) => {
        if (!vivo) return
        if (e instanceof ErroreCartella && e.permesso) setCartellaDaRiaprire(true)
        else logFailure('Video dalla cartella collegata')(e)
      })
      .finally(() => vivo && setCercatoInCartella(true))
    return () => {
      vivo = false
    }
  }, [loc, fileId, stato?.aperto, riaperta])
  // Né dal disco né dal server di casa: un vecchio video di Google Drive, che
  // Ciak non usa più (dalla cronologia, da un link salvato).
  const daDrive = !casa && !loc
  // L'indirizzo del file scelto, creato in un effetto e non durante il
  // disegno: così si rilascia quando non serve più, senza sprecare memoria.
  const [urlAperto, setUrlAperto] = useState<string | null>(null)
  useEffect(() => {
    if (!aperto) return setUrlAperto(null)
    const url = URL.createObjectURL(aperto.file)
    setUrlAperto(url)
    return () => URL.revokeObjectURL(url)
  }, [aperto])
  const [salvando, setSalvando] = useState(false)
  const [erroreSalva, setErroreSalva] = useState<string | null>(null)

  // Il film salvato in Ciak: undefined finché non si è guardato in cache.
  const [locale, setLocale] = useState<FilmOffline | null | undefined>(undefined)
  const scaricato = locale?.stato === 'completo'
  // Il suo file, quando non c'è quello del disco: dalla cache, rilasciato
  // uscendo come quello scelto.
  const [urlSalvato, setUrlSalvato] = useState<string | null>(null)
  useEffect(() => {
    if (!scaricato || aperto) return setUrlSalvato(null)
    let vivo = true
    let fatto: string | null = null
    urlFilmSalvato(fileId)
      .then((u) => {
        fatto = u
        if (vivo) setUrlSalvato(u)
        else if (u) URL.revokeObjectURL(u)
      })
      .catch(logFailure('Film salvato in Ciak'))
    return () => {
      vivo = false
      if (fatto) URL.revokeObjectURL(fatto)
    }
  }, [fileId, scaricato, aperto])
  const [cancellando, setCancellando] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const navigate = useNavigate()
  // Lo schermo intero di Ciak è quello della pagina, non del <video>: passando
  // all'episodio dopo il <video> si rifà da capo, e col suo schermo intero si
  // tornava ogni volta alla finestra. E sopra il video restano visibili i
  // pulsanti per saltare le sigle.
  const [schermoIntero, setSchermoIntero] = useState(() => document.fullscreenElement === document.documentElement)
  // Lo schermo intero del browser sul solo <video> (il suo pulsante, che
  // Firefox mostra comunque, o Chrome che ci va da solo girando il tablet):
  // lì sopra il video non resta niente, né il tocco per la pausa né «Salta
  // sigla». Si passa a quello di Ciak; se il browser non lo concede senza un
  // tocco, il lettore occupa comunque tutta la finestra (`aTuttaFinestra`) e
  // il primo tocco sul video chiede lo schermo intero vero.
  const [aTuttaFinestra, setATuttaFinestra] = useState(false)
  const daRotazione = useRef(false)
  useEffect(() => {
    const cambia = () => {
      const v = videoRef.current
      if (v && document.fullscreenElement === v) {
        daRotazione.current = true
        setATuttaFinestra(true)
        document
          .exitFullscreen()
          .then(() => document.documentElement.requestFullscreen())
          .catch(() => {
            /* niente schermo intero vero senza un tocco: resta a tutta finestra */
          })
        return
      }
      const nostro = document.fullscreenElement === document.documentElement
      setSchermoIntero(nostro)
      // Ottenuto quello vero, la finestra intera non serve più: uscendo col
      // gesto «indietro» si torna al lettore normale.
      if (nostro) setATuttaFinestra(false)
    }
    document.addEventListener('fullscreenchange', cambia)
    return () => document.removeEventListener('fullscreenchange', cambia)
  }, [])
  // Rimettendo il tablet in verticale si esce, come avrebbe fatto il browser.
  useEffect(() => {
    const orientamento = typeof screen !== 'undefined' ? screen.orientation : undefined
    if (!orientamento) return
    const gira = () => {
      if (!daRotazione.current || !orientamento.type.startsWith('portrait')) return
      daRotazione.current = false
      setATuttaFinestra(false)
      if (document.fullscreenElement) document.exitFullscreen().catch(logFailure('Uscita dallo schermo intero'))
    }
    orientamento.addEventListener('change', gira)
    return () => orientamento.removeEventListener('change', gira)
  }, [])
  const cinema = schermoIntero || aTuttaFinestra
  // A tutto schermo la pagina sotto non deve scorrere: la sua barra di
  // scorrimento restava visibile sul bordo destro del film.
  useEffect(() => {
    if (!cinema) return
    const prima = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
    return () => {
      document.documentElement.style.overflow = prima
    }
  }, [cinema])
  // Dove si è nell'episodio: all'inizio (si può saltare la sigla), nella sigla
  // finale, finito. Si aggiornano solo quando cambiano, non a ogni timeupdate.
  // «Salta sigla» fisso, solo toccando, o niente (vedi `pulsanteSigla`).
  const [pulsante, setPulsante] = useState<'fisso' | 'con-comandi' | null>('con-comandi')
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
  // Telefono o tablet: lì un tocco sul video lo ferma e lo fa ripartire.
  const touch = useMemo(
    () => typeof window.matchMedia === 'function' && window.matchMedia('(hover: none) and (pointer: coarse)').matches,
    [],
  )
  const audioControllato = useRef(false)
  // Riprese automatiche dopo un errore di rete, e da che punto è partita l'ultima:
  // il conto si azzera quando il film torna a scorrere per un po'.
  const tentativi = useRef(0)
  const ripresoDa = useRef(0)
  // Da dove ripartire al prossimo caricamento (errore, ricollegamento). Non si
  // può leggere `posizione` in quel momento: `load()` azzera il tempo e manda
  // un timeupdate a 0 prima di loadedmetadata, e il film ripartiva da capo.
  const daRiprendere = useRef(0)
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
  // Il <video> di questo giro, preso ora: quando l'effetto si chiude il ref
  // è già vuoto. Si rilascia cambiando episodio.
  useEffect(() => {
    const v = videoRef.current
    return () => rilasciaVideo(v, logFailure('Rilascio del video precedente'))
  }, [])
  // Dal server di casa si aspetta di sapere quale flusso chiedere: prima non
  // c'è niente da far partire. Dal disco, lo stesso: senza il file né una
  // copia in Ciak non parte.
  const srcLocale = urlAperto ?? urlSalvato
  const pronto = casa ? infoCasa !== null : srcLocale !== null
  useEffect(() => {
    if (!pronto) return vigilanzaAvvio.current.fine()
    vigilanzaAvvio.current.inizio()
  }, [pronto])

  // Il film salvato in Ciak: si guarda anche senza il disco, in giro, offline.
  useEffect(() => {
    if (!valido) return
    let attivo = true
    void filmOffline(fileId).then((f) => attivo && setLocale(f))
    return () => {
      attivo = false
    }
  }, [fileId, valido])

  useEffect(
    () =>
      ascoltaFilmOffline((evento) => {
        if (evento.id !== fileId || evento.stato === 'in-corso') return
        void filmOffline(fileId).then(setLocale)
      }),
    [fileId],
  )

  // I sottotitoli: dal server di casa quelli che conosce Jellyfin; dal disco
  // quelli accanto al video, o trovati online (vedi useSottotitoli). Senza il
  // file a portata (la copia salvata in Ciak) quelli salvati insieme a lui.
  const subDisco = useSottotitoli(aperto)
  const subCasa = useSottotitoliCasa(fileId, infoCasa)
  const sub = casa ? subCasa : subDisco
  const usaSalvati = loc && !aperto

  const salvati = usaSalvati ? locale?.sottotitoli : undefined
  const tracceSalvate = useMemo(
    () =>
      (salvati ?? []).map((s) => ({
        ...s,
        url: URL.createObjectURL(new Blob([s.vtt], { type: 'text/vtt' })),
      })),
    [salvati],
  )
  useEffect(() => () => tracceSalvate.forEach((t) => URL.revokeObjectURL(t.url)), [tracceSalvate])

  const tracce = usaSalvati ? tracceSalvate : sub.tracce

  // Il legame con l'archivio: quale titolo è, dove ci si era fermati, e a fine
  // visione «visto» nel diario (o l'episodio spuntato) e il voto.
  const archivio = useArchivioStreaming(fileId, valido)
  const { caricata: archivioCaricato, applicaRipresa, prossimo, precedente } = archivio
  const serie = archivio.voce?.media_type === 'tv' && archivio.voce.tmdb_id ? `tv-${archivio.voce.tmdb_id}` : null
  const [durataBase, setDurataBase] = useState<number | null>(null)
  useEffect(() => setDurataBase(serie ? leggiDurataSigla(serie) : null), [serie])
  const [punti, setPunti] = useState<PuntiSigla>(PUNTI_VUOTI)
  useEffect(() => setPunti(serie ? leggiPuntiSigla(serie) : PUNTI_VUOTI), [serie])
  // Quanto dura la sigla iniziale: dai tempi della serie, se ci sono, se no
  // quella di base. null fuori dalle serie: lì non si salta niente.
  const durataSigla = durataBase === null ? null : durataDaPunti(punti, durataBase)
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
  // I tempi esatti di questo episodio, se TheIntroDB li ha: valgono più del
  // punto imparato per la serie, perché ogni episodio ha i suoi.
  const [esatte, setEsatte] = useState<SigleEpisodio | null>(null)
  const voceTv = archivio.voce?.media_type === 'tv' ? archivio.voce : null
  useEffect(() => {
    if (!voceTv?.tmdb_id || voceTv.stagione == null || voceTv.episodio == null) return
    let vivo = true
    void sigleEpisodio(voceTv.tmdb_id, voceTv.stagione, voceTv.episodio).then((s) => vivo && setEsatte(s))
    return () => {
      vivo = false
    }
  }, [voceTv?.tmdb_id, voceTv?.stagione, voceTv?.episodio])
  const siglaEsatta = esatte?.inizio ?? null
  const codaEsatta = esatte?.finale ?? null
  const etichettaProssimo = prossimo ? sigla(prossimo) : null
  const vaiAlProssimo = useCallback(() => {
    if (!prossimo) return
    navigate(`/streaming/${prossimo.drive_file_id}`, {
      state: { titolo: titoloDaMostrare(prossimo) ?? undefined, file: prossimo.nome_file ?? undefined },
    })
  }, [navigate, prossimo])
  // Tornare all'episodio prima: dal lettore, dalla tastiera (P) e dalla
  // schermata di blocco del telefono, come per il successivo.
  const vaiAlPrecedente = useCallback(() => {
    if (!precedente) return
    navigate(`/streaming/${precedente.drive_file_id}`, {
      state: { titolo: titoloDaMostrare(precedente) ?? undefined, file: precedente.nome_file ?? undefined },
    })
  }, [navigate, precedente])
  // Premuto a mano durante la sigla finale: quanto mancava alla fine è dove
  // comincia la sigla finale di questa serie, per saltarla da sola. Un punto
  // già impostato (a mano o così) non si tocca: si cambia dalle «Sigle».
  const prossimoDallaSigla = useCallback(() => {
    const v = videoRef.current
    if (v && !finito && !codaAutomatica && punti.coda === null) {
      const coda = secondiAllaFine(v.currentTime, Number.isFinite(v.duration) ? v.duration : null)
      if (coda !== null) imparaPunti({ coda })
    }
    vaiAlProssimo()
  }, [finito, codaAutomatica, punti.coda, imparaPunti, vaiAlProssimo])
  useEffect(() => {
    const v = videoRef.current
    if (archivioCaricato && v && v.readyState >= 1) applicaRipresa(v)
  }, [archivioCaricato, applicaRipresa])

  // Pausa, ripresa e salti: dal tocco, dalla tastiera, dalla schermata di blocco.
  const alternaRiproduzione = useCallback((): boolean => {
    const v = videoRef.current
    if (!v) return true
    if (v.paused || v.ended) {
      v.play().catch(logFailure('Ripresa del film'))
      return false
    }
    v.pause()
    return true
  }, [])
  const salta = useCallback((secondi: number) => {
    const v = videoRef.current
    if (!v) return
    const fine = Number.isFinite(v.duration) ? v.duration : Infinity
    v.currentTime = Math.min(fine, Math.max(0, v.currentTime + secondi))
  }, [])

  // I sottotitoli trovati dopo il download, o cambiati, raggiungono la scheda
  // del film sul dispositivo: offline si vedono quelli.
  useEffect(() => {
    if (!locale || usaSalvati || sub.tracce.length === 0) return
    void salvaSottotitoliOffline(
      fileId,
      sub.tracce.map(({ chiave, lingua, etichetta, vtt }) => ({ chiave, lingua, etichetta, vtt })),
    ).catch(logFailure('Sottotitoli nella scheda del film offline'))
  }, [fileId, locale, usaSalvati, sub.tracce])

  // Quale sottotitolo si vede (-1: nessuno): spenti finché non se ne sceglie
  // uno dal CC, poi la stessa lingua anche negli episodi e nei film dopo (vedi
  // lib/sceltaSottotitoli).
  const [linguaSottotitoli, setLinguaSottotitoli] = useState(leggiLinguaSottotitoli)
  const [sottotitoloToccato, setSottotitoloToccato] = useState<number | null>(null)
  const sottotitolo = indiceSottotitolo(tracce, linguaSottotitoli, sottotitoloToccato)
  const scegliSottotitoli = useCallback(
    (indice: number) => {
      const lingua = indice < 0 || !tracce[indice] ? null : linguaTraccia(tracce[indice])
      setLinguaSottotitoli(lingua)
      setSottotitoloToccato(indice < 0 ? null : indice)
      salvaLinguaSottotitoli(lingua)
    },
    [tracce],
  )
  const [dimensioneSottotitoli, setDimensioneSottotitoli] = useState(leggiDimensioneSottotitoli)
  const cambiaDimensioneSottotitoli = useCallback((i: number) => {
    setDimensioneSottotitoli(i)
    salvaDimensioneSottotitoli(i)
  }, [])
  // La barra dei comandi di Ciak c'è a video fermo, al tocco e col mouse, e
  // sparisce dopo qualche secondo di visione; col menu dei sottotitoli aperto
  // resta.
  const riquadroVideo = useRef<HTMLDivElement>(null)
  // L'ultimo «Salta sigla» (vedi `saltaSigla`): sta qui, prima dei return
  // anticipati, perché gli hook vanno chiamati sempre nello stesso ordine.
  const ultimoSalto = useRef<Salto | null>(null)
  const [menuSottotitoliAperto, setMenuSottotitoliAperto] = useState(false)
  const [menuAudioAperto, setMenuAudioAperto] = useState(false)
  const comandiVisibili = useComandiVisibili(riquadroVideo, videoRef, menuSottotitoliAperto || menuAudioAperto)

  // La lingua dell'audio (vedi lib/tracceAudio): il menu c'è solo per i video
  // con più lingue, preparate da prepara-ciak accanto al film sul disco.
  const audioDisco = useTracceAudio(aperto)
  // Dal server di casa le lingue le conosce Jellyfin, dentro e accanto al file.
  const tracceCasa = useMemo<TracciaAudio[]>(
    () => (infoCasa ? infoCasa.audio.map((a, i) => ({ indice: i + 1, lingua: a.lingua, titolo: a.titolo, fileId: null })) : []),
    [infoCasa],
  )
  const tracceAudio = casa ? tracceCasa : audioDisco.tracce
  const voceAudio = archivio.voce
  // Ricordata per serie (un anime doppiato, un altro in originale); per i film
  // una scelta sola.
  const ambitoAudio =
    voceAudio?.tmdb_id && voceAudio.stagione != null ? `${voceAudio.media_type}-${voceAudio.tmdb_id}` : 'film'
  const [audioToccato, setAudioToccato] = useState<{ fileId: string; indice: number } | null>(null)
  const audioRicordato = useMemo(
    () => (archivioCaricato ? indiceAudio(tracceAudio, leggiLinguaAudio(ambitoAudio)) : 0),
    [archivioCaricato, tracceAudio, ambitoAudio],
  )
  const sceltaAudio = audioToccato?.fileId === fileId ? audioToccato.indice : audioRicordato
  const tracciaAudio = tracceAudio[sceltaAudio]
  const scegliAudio = useCallback(
    (indice: number) => {
      // Dal server di casa un'altra lingua è un altro flusso, e il <video> si
      // rifà: riparte da dove si era.
      if (casa) daRiprendere.current = posizione.current
      setAudioToccato({ fileId, indice })
      salvaLinguaAudio(ambitoAudio, tracceAudio[indice]?.lingua ?? null)
    },
    [casa, fileId, ambitoAudio, tracceAudio],
  )
  // L'<audio> della lingua scelta, quando non è quella dentro il video: lo
  // segue in tutto, e il video tace (vedi lib/sincroniaAudio).
  const srcAudio = !casa && tracciaAudio?.fileId ? audioDisco.url(tracciaAudio.fileId) : null

  // Il flusso del server di casa: il file così com'è quando il browser lo
  // legge e si sente la prima lingua; altrimenti convertito da Jellyfin (HLS),
  // con la lingua scelta. Un file diretto che non parte passa da solo alla
  // conversione (vedi suErrore e segnala).
  const [hlsForzato, setHlsForzato] = useState(false)
  const idSessione = useMemo(() => Math.random().toString(36).slice(2), [])
  const audioCasa = casa && infoCasa ? infoCasa.audio[sceltaAudio] : undefined
  const direttoCasa =
    !!infoCasa && !hlsForzato && riproducibileDirettamente(infoCasa) && (!audioCasa || audioCasa === tracciaPredefinita(infoCasa))
  // Una sessione per lingua: Jellyfin ne converte una sola per sessione.
  const sessioneCasa = `ciak-${idSessione}-${audioCasa?.indice ?? 'p'}`
  const hlsCasa = casa && infoCasa && !direttoCasa ? flussoHls(fileId, infoCasa, audioCasa?.indice ?? null, sessioneCasa) : null
  const srcVideo = casa ? (direttoCasa ? flussoDiretto(fileId) : undefined) : (srcLocale ?? undefined)
  // Letto dagli avvisi, che possono essere stati creati a un disegno di prima.
  const direttoCasaRef = useRef(direttoCasa)
  direttoCasaRef.current = direttoCasa
  useHls(videoRef, hlsCasa, 0, (m) => setErrore(m))
  useEffect(() => {
    if (!hlsCasa) return
    return () => fermaConversione(sessioneCasa)
  }, [hlsCasa, sessioneCasa])
  const [elementoAudio, setElementoAudio] = useState<HTMLAudioElement | null>(null)
  const videoCorrente = useElementoVideo(videoRef)
  useEffect(() => {
    if (!videoCorrente || !elementoAudio) return
    return collegaAudio(videoCorrente, elementoAudio, (e) => {
      // Un play() interrotto da una pausa subito dopo non è un guasto.
      if (!(e instanceof DOMException && e.name === 'AbortError')) logFailure('Lingua dell’audio')(e)
    })
  }, [videoCorrente, elementoAudio])

  const titolo =
    stato?.titolo ??
    locale?.titolo ??
    (archivio.voce ? titoloDaMostrare(archivio.voce) : null) ??
    (sub.info ? titoloVideo({ name: sub.info.name, cartella: sub.cartella, serie: sub.serie }) : 'Film')
  const nomeFile = stato?.file ?? locale?.file ?? aperto?.file.name ?? sub.info?.name

  // La tastiera sul computer: un gestore solo, che chiama le azioni di questo
  // disegno (vedi `suTasto.current`, più sotto).
  const suTasto = useRef<(azione: AzioneTasto) => void>(() => {})
  useEffect(() => {
    const premuto = (e: KeyboardEvent) => {
      const azione = azioneTasto(e, e.target instanceof HTMLElement ? e.target : null)
      if (!azione) return
      // Prima del browser: lo spazio non scorre la pagina e non preme di nuovo
      // l'ultimo pulsante, e il video in primo piano non salta due volte.
      e.preventDefault()
      e.stopPropagation()
      suTasto.current(azione)
    }
    window.addEventListener('keydown', premuto, true)
    return () => window.removeEventListener('keydown', premuto, true)
  }, [])

  // La schermata di blocco e le notifiche del telefono: titolo, locandina,
  // pausa, salti e l'episodio dopo, anche a schermo spento o da un'altra app.
  const posterSessione = archivio.voce?.poster_path ?? null
  useEffect(() => {
    const sessione = typeof navigator !== 'undefined' && 'mediaSession' in navigator ? navigator.mediaSession : null
    if (!sessione) return
    if (typeof MediaMetadata !== 'undefined') sessione.metadata = new MediaMetadata(metadatiSessione(titolo, posterSessione))
    const azioni: [MediaSessionAction, MediaSessionActionHandler | null][] = [
      ['play', () => videoRef.current?.play().catch(logFailure('Ripresa dalla schermata di blocco'))],
      ['pause', () => videoRef.current?.pause()],
      ['seekbackward', (d) => salta(-(d.seekOffset ?? SALTO_TASTIERA))],
      ['seekforward', (d) => salta(d.seekOffset ?? SALTO_TASTIERA)],
      [
        'seekto',
        (d) => {
          if (videoRef.current && d.seekTime != null) videoRef.current.currentTime = d.seekTime
        },
      ],
      ['nexttrack', prossimo ? vaiAlProssimo : null],
      ['previoustrack', precedente ? vaiAlPrecedente : null],
    ]
    const imposta = (azione: MediaSessionAction, gestore: MediaSessionActionHandler | null) => {
      try {
        sessione.setActionHandler(azione, gestore)
      } catch {
        // Un'azione che questo browser non conosce: le altre funzionano lo stesso.
      }
    }
    for (const [azione, gestore] of azioni) imposta(azione, gestore)
    return () => {
      sessione.metadata = null
      for (const [azione] of azioni) imposta(azione, null)
    }
  }, [titolo, posterSessione, prossimo, vaiAlProssimo, precedente, vaiAlPrecedente, salta])

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
  if (daDrive) {
    return (
      <div className="space-y-4">
        {indietro}
        <ErrorState
          title="Questo video era su Google Drive"
          message="Ciak non usa più Google Drive: i film si guardano dalla cartella del PC. Torna all’elenco e aprilo da lì."
        />
      </div>
    )
  }

  // Un avviso dentro la pagina non si vede in schermo intero: prima si esce.
  function segnala(p: Problema) {
    if (casa) {
      // Il file diretto che non parte (o parte muto) lo converte Jellyfin.
      if (direttoCasaRef.current && (p === 'avvio' || p === 'muto' || p === 'formato')) {
        daRiprendere.current = posizione.current
        setHlsForzato(true)
        return
      }
      setErrore(
        p === 'salto'
          ? 'Il salto non è riuscito: il server di casa non ha mandato quel pezzo di film. Riprova.'
          : 'Il server di casa non riesce a mandare questo video: il PC è acceso, con Jellyfin aperto? Fuori casa serve Tailscale acceso anche qui.',
      )
      if (document.fullscreenElement) document.exitFullscreen().catch(logFailure('Uscita dallo schermo intero'))
      return
    }
    // Dal disco: il file è lì, e se non parte è il formato. Un film muto
    // però va avanti: lo si dice sotto il video, senza strappare chi guarda
    // dallo schermo intero (se ne accorge da sé, e uscendo trova il perché).
    setErrore(MESSAGGI[p])
    if (p !== 'muto' && document.fullscreenElement) document.exitFullscreen().catch(logFailure('Uscita dallo schermo intero'))
  }

  function alternaSchermoIntero() {
    daRotazione.current = false
    if (aTuttaFinestra || document.fullscreenElement) {
      setATuttaFinestra(false)
      if (document.fullscreenElement) document.exitFullscreen().catch(logFailure('Uscita dallo schermo intero'))
    } else document.documentElement.requestFullscreen().catch(logFailure('Schermo intero del lettore'))
  }

  const siglaSaltabile = durataSigla !== null && pulsante !== null && !siglaSaltata && !finito
  // Dove la sigla c'è di sicuro il pulsante resta, come su Netflix; nel resto
  // dei primi minuti compare con la barra: fisso per tutto quel tempo dava
  // fastidio, ma sparire del tutto lo faceva mancare proprio a sigla in corso.
  const saltaSiglaInVista = siglaSaltabile && (pulsante === 'fisso' || comandiVisibili)
  // Il pulsante CC passa al sottotitolo dopo, e dall'ultimo a nessuno.
  const prossimoSottotitolo = sottotitolo + 1 >= tracce.length ? -1 : sottotitolo + 1
  const nomiSottotitoli = tracce.map((t, i) => {
    const nome = nomeLingua(t.lingua)
    // Due tracce nella stessa lingua: si distinguono col numero.
    return tracce.filter((x) => nomeLingua(x.lingua) === nome).length > 1 ? `${nome} ${i + 1}` : nome
  })
  const siglaSottotitolo =
    sottotitolo < 0 ? 'off' : (tracce[sottotitolo]?.lingua?.toUpperCase().slice(0, 2) ?? String(sottotitolo + 1))

  // La tastiera sul computer. Il gestore resta lo stesso; le azioni cambiano
  // a ogni disegno (la sigla saltabile, il prossimo episodio), e si leggono qui.
  suTasto.current = (azione) => {
    if (azione === 'pausa') alternaRiproduzione()
    else if (azione === 'indietro') salta(-SALTO_TASTIERA)
    else if (azione === 'avanti') salta(SALTO_TASTIERA)
    else if (azione === 'schermo') alternaSchermoIntero()
    else if (azione === 'sigla' && siglaSaltabile) saltaSigla()
    else if (azione === 'prossimo' && prossimo) {
      // Come il pulsante: durante la sigla finale insegna dove comincia.
      if (inCoda) prossimoDallaSigla()
      else vaiAlProssimo()
    } else if (azione === 'precedente' && precedente) vaiAlPrecedente()
    else if (azione === 'audio') {
      // Con un'altra lingua il video tace già: il muto è quello dell'audio.
      const suono = elementoAudio ?? videoRef.current
      if (suono) suono.muted = !suono.muted
    }
    else if (azione === 'sottotitoli' && tracce.length > 0) scegliSottotitoli(prossimoSottotitolo)
  }

  // A mano insegna anche dove comincia la sigla in questa serie; da sola
  // (`automatica`) lascia per qualche secondo «↩ Rivedi la sigla». Il salto
  // si ricorda in `ultimoSalto`: la barra trascinata subito dopo insegna dove
  // finisce (vedi `fineDaCorrezione`, in onSeeked).
  function saltaSigla(automatica = false) {
    const v = videoRef.current
    if (!v || durataSigla === null) return
    const da = v.currentTime
    const a = arrivoSalto(da, punti, durataSigla, Number.isFinite(v.duration) ? v.duration : null, siglaEsatta)
    v.currentTime = a
    if (!siglaEsatta) ultimoSalto.current = { da, a, quando: Date.now() }
    setSiglaSaltata(true)
    if (automatica) setRivedi(da)
    // Con i tempi esatti non c'è niente da imparare, e un inizio già noto non
    // lo sposta un salto premuto in ritardo: si parte da «Reimpara».
    else if (!siglaEsatta && punti.inizio === null) imparaPunti({ inizio: Math.round(da) })
  }

  function cambiaScelte(nuove: Partial<SaltaSigle>) {
    const aggiornate = { ...scelte, ...nuove }
    salvaSaltaSigle(aggiornate)
    setScelte(aggiornate)
  }

  function suErrore(v: HTMLVideoElement) {
    if (casa) {
      const codice = v.error?.code
      void registraErrore('lettore: errore video dal server di casa', { codice, messaggio: v.error?.message, posizione: posizione.current, diretto: direttoCasaRef.current })
      // Rete: si riprova qualche volta dallo stesso punto.
      if (codice === MediaError.MEDIA_ERR_NETWORK && tentativi.current < TENTATIVI_MAX) {
        tentativi.current++
        ripresoDa.current = posizione.current
        daRiprendere.current = posizione.current
        v.load()
        return
      }
      return segnala(codice === MediaError.MEDIA_ERR_NETWORK ? 'rete' : 'formato')
    }
    const nome = aperto?.file.name ?? locale?.file ?? ''
    void registraErrore('lettore: errore video dal dispositivo', { codice: v.error?.code, messaggio: v.error?.message, nome })
    if (nome && !formatoLeggibile(nome)) {
      setErrore('Il browser non sa leggere questo formato (succede spesso con MKV e AVI). Convertilo in MP4 con prepara-ciak e riaprilo.')
      if (document.fullscreenElement) document.exitFullscreen().catch(logFailure('Uscita dallo schermo intero'))
      return
    }
    segnala('formato')
  }

  // Il film aperto dal disco, copiato in Ciak: sul tablet si guarda poi anche
  // senza il file a portata (e senza rete), finché non lo si elimina.
  async function salvaInCiak() {
    if (!aperto) return
    setErroreSalva(null)
    setSalvando(true)
    try {
      await salvaFileSulDispositivo(
        { id: fileId, titolo, file: aperto.file.name },
        aperto.file,
        sub.tracce.map(({ chiave, lingua, etichetta, vtt }) => ({ chiave, lingua, etichetta, vtt })),
      )
      setLocale(await filmOffline(fileId))
    } catch (e) {
      setErroreSalva(e instanceof Error ? e.message : 'Salvataggio non riuscito.')
      logFailure('Film del dispositivo salvato in Ciak')(e)
    } finally {
      setSalvando(false)
    }
  }

  async function elimina() {
    await eliminaFilm(fileId).catch(logFailure('Eliminazione del film offline'))
    setLocale(null)
  }

  // Cancellare il video da Ciak vuol dire cancellarlo dal disco, coi suoi
  // sottotitoli e le sue lingue (e, se la cartella resta vuota, con la
  // cartella). Non passa dal Cestino di Windows: la conferma lo dice.
  async function cancellaDalPc() {
    if (!window.confirm(`Vuoi cancellare «${titolo}» dal disco?\nVa via il file, coi suoi sottotitoli, dalla cartella «${cartellaCollegata()}». Non finisce nel Cestino: non si recupera.`)) return
    setErrore(null)
    setCancellando(true)
    try {
      await cancellaDalDisco([fileId])
      if (scaricato) await eliminaFilm(fileId).catch(logFailure('Eliminazione del film salvato in Ciak'))
      navigate('/streaming', { replace: true, state: { cancellato: titolo } })
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Cancellazione non riuscita.')
      logFailure('Cancellazione del video dal disco')(e)
    } finally {
      setCancellando(false)
    }
  }

  const testoSottotitoli =
    usaSalvati && tracce.length === 0
      ? 'Nessun sottotitolo salvato con il film.'
      : sub.stato === 'cerco' && !usaSalvati
      ? 'Cerco i sottotitoli…'
      : tracce.length > 0
        ? // Le tracce trovate e, se una lingua manca, anche questo: altrimenti
          // chi cerca l'inglese non capisce perché non c'è.
          [tracce.map((t) => t.etichetta).join(' · '), !usaSalvati && sub.messaggio].filter(Boolean).join(' · ')
        : sub.stato === 'errore'
          ? `Sottotitoli non disponibili: ${sub.messaggio ?? 'errore sconosciuto'}`
          : (sub.messaggio ?? 'Nessun sottotitolo, né accanto al video né su OpenSubtitles.')

  return (
    <div className="space-y-4">
      {indietro}
      <div>
        <h1 className="font-display text-3xl tracking-wide text-zinc-100">{titolo}</h1>
        {nomeFile && nomeFile !== titolo && <p className="mt-1 truncate text-xs text-zinc-500">{nomeFile}</p>}
      </div>

      <div
        ref={riquadroVideo}
        className={
          cinema
            ? // Senza !mt-0 il margine fra i blocchi della pagina (space-y-4) lo
              // spostava in basso di 16 px, e i comandi finivano fuori schermo.
              'fixed inset-0 z-[100] !mt-0 bg-black'
            : 'relative aspect-video w-full overflow-hidden rounded-xl bg-black shadow-reel'
        }
      >
        <video
          // Dal server di casa un flusso nuovo (un'altra lingua, la
          // conversione) è un elemento nuovo: hls.js e il file diretto non
          // si contendono lo stesso <video>.
          key={hlsCasa ?? 'diretto'}
          ref={videoRef}
          src={srcVideo}
          // Senza i comandi del browser: ci sono quelli di Ciak (BarraLettore),
          // con lo schermo intero della pagina, che passa indenne
          // all'episodio dopo, e il CC coi sottotitoli disegnati da Ciak.
          // Niente <track>: i sottotitoli li disegna Ciak (SottotitoliVideo),
          // così il browser non mostra il suo CC in basso, scomodo sul
          // telefono. Si scelgono dal menu «CC» in alto a destra.
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
          onSeeked={(e) => {
            vigilanza.current.fine()
            const fine = fineDaCorrezione(ultimoSalto.current, e.currentTarget.currentTime, Date.now())
            if (fine !== null) {
              ultimoSalto.current = null
              imparaPunti({ fine })
            }
          }}
          onPlaying={() => vigilanza.current.fine()}
          onTimeUpdate={(e) => {
            const v = e.currentTarget
            posizione.current = v.currentTime
            archivio.suTempo(v)
            const t = v.currentTime
            // Con i tempi esatti dell'episodio il pulsante è fisso durante
            // la sigla e la coda parte coi titoli; senza, il punto imparato
            // per la serie e i primi minuti.
            const ora = pulsanteSigla(t, { esatta: siglaEsatta, punti, durata: durataSigla ?? DURATA_SIGLA_PREDEFINITA })
            if (ora !== pulsante) setPulsante(ora)
            const durataVideo = Number.isFinite(v.duration) ? v.duration : null
            const coda = codaEsatta ? t >= codaEsatta.da : inSiglaFinale(t, durataVideo)
            if (coda !== inCoda) setInCoda(coda)
            const partenzaSigla = siglaEsatta ? siglaEsatta.da : punti.inizio
            if (scelte.inizio && !siglaSaltata && inizioSiglaRaggiunto(t, partenzaSigla)) saltaSigla(true)
            // Dalla sigla finale parte il conto alla rovescia; tornando
            // indietro si ferma, invece di cambiare episodio a metà scena.
            const nellaCoda =
              scelte.fine && !!prossimo && (codaEsatta ? t >= codaEsatta.da : codaSiglaRaggiunta(t, durataVideo, punti.coda))
            if (nellaCoda !== codaAutomatica) setCodaAutomatica(nellaCoda)
            if (tentativi.current > 0 && v.currentTime > ripresoDa.current + 30) tentativi.current = 0
            if (!audioControllato.current && v.currentTime >= 3) {
              audioControllato.current = true
              if (senzaAudio(v)) segnala('muto')
            }
          }}
        />
        <SottotitoliVideo
          videoRef={videoRef}
          contenitore={riquadroVideo}
          vtt={sottotitolo < 0 ? null : (tracce[sottotitolo]?.vtt ?? null)}
          chiaveVideo={hlsCasa ?? 'diretto'}
          scala={DIMENSIONI_SOTTOTITOLI[dimensioneSottotitoli].scala}
          sollevate={comandiVisibili}
        />
        {srcAudio && (
          // Una lingua nuova è un elemento nuovo: riparte allineato al video.
          <audio key={srcAudio} ref={setElementoAudio} src={srcAudio} preload="auto" data-testid="audio-lingua" />
        )}
        <IndicatoreCaricamento videoRef={videoRef} />
        {loc && locale !== undefined && cercatoInCartella && !srcLocale && (
          // Riaprendo Ciak (o dalla cronologia) il file del disco non c'è più:
          // il browser non lascia riaprirlo da solo. Con la cartella collegata
          // basta ridargli il permesso; senza, il file va scelto di nuovo.
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/80 p-6 text-center text-sm text-zinc-300">
            {cartellaDaRiaprire ? (
              <>
                <p>
                  {cartellaScelta()
                    ? 'Questo browser lascia leggere la cartella dei film solo per una visita: sceglila di nuovo.'
                    : 'Il browser chiede di nuovo il permesso di leggere la cartella dei film.'}
                </p>
                <ScegliCartella
                  riapri
                  etichetta={`📂 Riapri la cartella «${cartellaCollegata()}»`}
                  className="btn-primary"
                  onFatto={() => setRiaperta((n) => n + 1)}
                />
              </>
            ) : (
              <>
                <p>
                  {cartellaCollegata()
                    ? `Questo video${nomeFile ? ` (${nomeFile})` : ''} non è più nella cartella collegata: è stato spostato o cancellato? Puoi sceglierlo a mano.`
                    : `Questo film è sul tuo dispositivo${nomeFile ? ` (${nomeFile})` : ''}: sceglilo di nuovo per guardarlo, il browser non lascia riaprire un file da solo.`}
                </p>
                <ApriFilmLocale grande />
              </>
            )}
          </div>
        )}
        {/* Anche col mouse: senza i comandi del browser il clic sul video
           ferma e riprende, come in ogni lettore. */}
        <ToccoVideo
          onAlterna={() => {
            // A tutta finestra senza schermo intero vero: questo tocco lo concede.
            if (aTuttaFinestra && !document.fullscreenElement) {
              document.documentElement.requestFullscreen().catch(logFailure('Schermo intero del lettore'))
            }
            return alternaRiproduzione()
          }}
          onSalta={salta}
        />
        <AvvisoRipresa
          da={archivio.ripresoDa}
          onRicomincia={() => {
            if (videoRef.current) videoRef.current.currentTime = 0
          }}
        />
        <BarraLettore
          videoRef={videoRef}
          visibile={comandiVisibili}
          cinema={cinema}
          onSchermoIntero={alternaSchermoIntero}
          suono={elementoAudio}
        >
          {/* Gli episodi accanto, sempre a portata: non solo «il prossimo» a fine
              episodio, ma anche tornare a quello prima. */}
          {precedente && (
            <button
              type="button"
              onClick={vaiAlPrecedente}
              aria-label={`Episodio precedente: ${sigla(precedente) ?? ''}`}
              title={`Episodio precedente (${sigla(precedente) ?? ''}) · P`}
              className="rounded-md px-2 py-1 text-zinc-100 transition hover:bg-white/10"
            >
              ⏮
            </button>
          )}
          {prossimo && (
            <button
              type="button"
              onClick={inCoda ? prossimoDallaSigla : vaiAlProssimo}
              aria-label={`Episodio successivo: ${sigla(prossimo) ?? ''}`}
              title={`Episodio successivo (${sigla(prossimo) ?? ''}) · N`}
              className="rounded-md px-2 py-1 text-zinc-100 transition hover:bg-white/10"
            >
              ⏭
            </button>
          )}
          {tracceAudio.length > 1 && (
            <MenuAudio
              nomi={nomiTracceAudio(tracceAudio)}
              scelto={sceltaAudio}
              sigla={siglaTracciaAudio(tracciaAudio)}
              onScegli={scegliAudio}
              onAperto={setMenuAudioAperto}
            />
          )}
          {tracce.length > 0 && (
            <MenuSottotitoli
              nomi={nomiSottotitoli}
              scelto={sottotitolo}
              sigla={siglaSottotitolo}
              onScegli={scegliSottotitoli}
              onAperto={setMenuSottotitoliAperto}
              dimensione={dimensioneSottotitoli}
              onDimensione={cambiaDimensioneSottotitoli}
            />
          )}
        </BarraLettore>
        {/* In alto a destra, lontano dalla barra: «Salta sigla», «Rivedi la
           sigla» e l'episodio dopo. */}
        <div className="absolute right-2 top-2 flex flex-col items-end gap-2">
          {saltaSiglaInVista && (
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
      </div>

      {!touch && (
        <p className="text-xs text-zinc-500">
          Dalla tastiera: spazio pausa · ← → 10 secondi · F schermo intero · M audio{tracce.length > 0 && ' · C sottotitoli'}
          {serie && ' · S salta la sigla · N episodio dopo · P episodio prima'}
        </p>
      )}

      {serie && durataSigla !== null && (
        <SigleSerie
          punti={punti}
          onReimpara={() => imparaPunti(PUNTI_VUOTI)}
          scelte={scelte}
          onScelte={cambiaScelte}
          conEsatteInizio={siglaEsatta !== null}
          conEsatteFine={codaEsatta !== null}
          esatte={
            esatte && (esatte.inizio || esatte.finale)
              ? `Per questo episodio valgono i tempi esatti di TheIntroDB${
                  esatte.inizio ? `: sigla da ${formattaTempo(esatte.inizio.da)} a ${formattaTempo(esatte.inizio.a)}` : ''
                }${esatte.finale ? `${esatte.inizio ? ',' : ':'} titoli di coda da ${formattaTempo(esatte.finale.da)}` : ''}.`
              : null
          }
        />
      )}

      {(errore ?? erroreCasa) && (
        <p role="alert" className="rounded-xl border border-projector/40 bg-projector/10 p-4 text-sm text-zinc-200">
          {errore ?? erroreCasa}
        </p>
      )}

      {archivio.caricata && (
        <PannelloArchivio
          voce={archivio.voce}
          nome={filmDaCercare(nomeFile ?? titolo, sub.cartella, sub.serie)}
          ripresoDa={archivio.ripresoDa}
          visto={archivio.visto}
          votoSalvato={archivio.votoSalvato}
          errore={archivio.erroreArchivio}
          prossimo={archivio.prossimo}
          precedente={archivio.precedente}
          onRicomincia={() => {
            if (videoRef.current) videoRef.current.currentTime = 0
          }}
          onVota={(voto) => void archivio.vota(voto)}
          onCambia={archivio.cambiaAbbinamento}
        />
      )}

      {/* Dal dispositivo: il file del disco non si ritrova da solo dopo aver
          chiuso Ciak (il browser non lo permette), quindi o lo si sceglie di
          nuovo o se ne tiene una copia in Ciak. */}
      {loc && (scaricato || aperto) && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-theatre-800 bg-theatre-900/40 p-3 text-sm">
          {scaricato ? (
            <>
              <p className="flex-1 text-zinc-300">
                📱 Salvato in Ciak{locale?.dimensione ? ` (${taglia(locale.dimensione)})` : ''}: si vede anche senza il
                disco e senza rete. Quando l’hai visto, eliminalo per liberare spazio.
              </p>
              <button type="button" onClick={elimina} className="btn-ghost px-3 py-1.5">
                Elimina dal dispositivo
              </button>
            </>
          ) : (
            <>
              <p className="flex-1 text-zinc-400">
                {salvando
                  ? `💾 Lo copio in Ciak (${taglia(aperto?.file.size ?? 0)})…`
                  : 'Lo guardi dal file scelto. Sul tablet puoi copiarlo in Ciak, per vederlo poi anche senza il file a portata.'}
              </p>
              {offlineDisponibile() && (
                <button type="button" onClick={() => void salvaInCiak()} disabled={salvando} className="btn-ghost px-3 py-1.5">
                  {salvando ? 'Salvo…' : '💾 Salva in Ciak (per vederlo offline)'}
                </button>
              )}
            </>
          )}
          {erroreSalva && <p className="w-full text-red-400">{erroreSalva}</p>}
        </div>
      )}

      {/* Cancellare dal disco: i video della cartella collegata, dove il
          browser lascia modificarla (Chrome, Edge). */}
      {aperto?.origine === 'cartella' && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-theatre-800 bg-theatre-900/40 p-3 text-sm">
          <p className="flex-1 text-zinc-400">
            {cancellabileDalDisco()
              ? 'Non lo vuoi più? Lo cancelli dal disco, coi suoi sottotitoli: sparisce dalla cartella e da Ciak. Non passa dal Cestino.'
              : 'Per cancellarlo dal disco apri Ciak con Chrome o Edge (questo browser lascia solo leggere i file), oppure usa Esplora file.'}
          </p>
          {cancellabileDalDisco() && (
            <button type="button" onClick={() => void cancellaDalPc()} disabled={cancellando} className="btn-ghost px-3 py-1.5">
              {cancellando ? 'Cancello…' : '🗑 Cancella dal disco'}
            </button>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <p className="text-zinc-300">💬 {testoSottotitoli}</p>
        {tracce.length > 0 && (
          <label className="flex items-center gap-2 text-zinc-400">
            Mostra
            <select
              value={sottotitolo}
              onChange={(e) => scegliSottotitoli(Number(e.target.value))}
              className="rounded-lg border border-theatre-700 bg-theatre-950 px-2 py-1 text-zinc-100"
            >
              <option value={-1}>Nessun sottotitolo</option>
              {nomiSottotitoli.map((nome, i) => (
                <option key={tracce[i].url} value={i}>
                  {nome}
                </option>
              ))}
            </select>
          </label>
        )}
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
      </div>

      <div className="grid gap-3 text-sm text-zinc-400 sm:grid-cols-2">
        {casa ? (
          <>
            <div className="rounded-xl border border-theatre-800 bg-theatre-900/40 p-4">
              <p className="mb-1 font-medium text-zinc-200">🏠 Dal server di casa</p>
              <p>
                {direttoCasa
                  ? 'Il file arriva dal disco del PC così com’è, alla sua qualità piena.'
                  : 'Jellyfin converte il video al volo per il browser (formato o lingua): il PC lavora mentre guardi.'}{' '}
                Le altre lingue dell’audio si scelgono dal pulsante 🗣, i sottotitoli dal CC.
              </p>
            </div>
            <div className="rounded-xl border border-theatre-800 bg-theatre-900/40 p-4">
              <p className="mb-1 font-medium text-zinc-200">💬 Da dove arrivano i sottotitoli</p>
              <p>
                Quelli che Jellyfin conosce: i file <code>.srt</code> accanto al video e quelli dentro il
                file. Il plugin OpenSubtitles di Jellyfin li scarica da sé per quelli che mancano.
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="rounded-xl border border-theatre-800 bg-theatre-900/40 p-4">
              <p className="mb-1 font-medium text-zinc-200">💽 Dal dispositivo</p>
              <p>
                Il browser legge il file dal disco man mano, senza caricarlo da nessuna parte. MP4 e WebM
                partono ovunque; un MKV spesso no: convertilo prima con prepara-ciak. Le lingue dell’audio
                preparate da prepara-ciak si scelgono dal pulsante 🗣.
              </p>
            </div>
            <div className="rounded-xl border border-theatre-800 bg-theatre-900/40 p-4">
              <p className="mb-1 font-medium text-zinc-200">💬 Sottotitoli</p>
              <p>
                Prima i file <code>.srt</code> accanto al video (o scelti insieme al film): un nome che
                finisce in <code>.it.srt</code> o <code>.en.srt</code> dice la lingua. Se manca una lingua,
                OpenSubtitles, e quello trovato si salva accanto al video per la volta dopo.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
