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
import ComandiSigla from '../components/ComandiSigla'
import PulsantiEpisodi from '../components/PulsantiEpisodi'
import ToccoVideo from '../components/ToccoVideo'
import FileDaRiaprire from '../components/FileDaRiaprire'
import FileSulDisco from '../components/FileSulDisco'
import RigaSottotitoli from '../components/RigaSottotitoli'
import NoteLettore from '../components/NoteLettore'
import { DIMENSIONI_SOTTOTITOLI, testoSottotitoli } from '../lib/sceltaSottotitoli'
import { useComandiVisibili } from '../lib/useComandiVisibili'
import { SALTO_TASTIERA } from '../lib/comandiLettore'
import { idFileValido, titoloVideo } from '../lib/fileVideo'
import { ATTESA_AVVIO_MS, rilasciaVideo, senzaAudio, TENTATIVI_MAX, vigilanzaSalto, type Problema } from '../lib/lettore'
import { salvaSottotitoliOffline } from '../lib/filmOffline'
import { registraErrore } from '../lib/errorLog'
import { logFailure } from '../lib/logFailure'
import { filmDaCercare, titoloNoto } from '../lib/sottotitoli'
import { PUNTI_VUOTI } from '../lib/sigle'
import { titoloDaMostrare } from '../lib/streaming'
import { sigla } from '../lib/videoteca'
import { useArchivioStreaming } from '../lib/useArchivioStreaming'
import { useSottotitoli } from '../lib/useSottotitoli'
import { useElementoVideo } from '../lib/useElementoVideo'
import { collegaAudio } from '../lib/sincroniaAudio'
import { nomiTracceAudio, siglaTracciaAudio } from '../lib/tracceAudio'
import { eJellyfin } from '../lib/jellyfin'
import { useInfoCasa, useSottotitoliCasa } from '../lib/useLettoreCasa'
import { useFlussoCasa } from '../lib/useFlussoCasa'
import { formatoLeggibile } from '../lib/filmLocali'
import { useFileDelDisco } from '../lib/useFileDelDisco'
import { useSchermoInteroLettore } from '../lib/useSchermoInteroLettore'
import { useSigleLettore } from '../lib/useSigleLettore'
import { useSceltaSottotitoli } from '../lib/useSceltaSottotitoli'
import { useSceltaAudio } from '../lib/useSceltaAudio'
import { useSessioneMedia, useTastiera } from '../lib/useComandiEsterni'

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
  // Un film del disco (vedi filmLocali): il file scelto, quello della
  // cartella collegata o la copia salvata in Ciak. Si rilegge quando lo si
  // sceglie di nuovo dalla pagina stessa (`stato.aperto` cambia).
  const disco = useFileDelDisco(fileId, valido, stato?.aperto)
  const { loc, aperto, locale } = disco
  // Né dal disco né dal server di casa: un vecchio video di Google Drive, che
  // Ciak non usa più (dalla cronologia, da un link salvato).
  const daDrive = !casa && !loc
  const [errore, setErrore] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const navigate = useNavigate()
  const schermo = useSchermoInteroLettore(videoRef)
  const { cinema } = schermo
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
  const pronto = casa ? infoCasa !== null : disco.src !== null
  useEffect(() => {
    if (!pronto) return vigilanzaAvvio.current.fine()
    vigilanzaAvvio.current.inizio()
  }, [pronto])

  // Il legame con l'archivio: quale titolo è, dove ci si era fermati, e a fine
  // visione «visto» nel diario (o l'episodio spuntato) e il voto.
  const archivio = useArchivioStreaming(fileId, valido)
  const { caricata: archivioCaricato, applicaRipresa, prossimo, precedente } = archivio

  // I sottotitoli: dal server di casa quelli che conosce Jellyfin; dal disco
  // quelli accanto al video, o trovati online (vedi useSottotitoli). Senza il
  // file a portata (la copia salvata in Ciak) quelli salvati insieme a lui.
  // Una copia salvata senza sottotitoli li cerca come il file del disco.
  const subDisco = useSottotitoli(aperto ?? disco.copiaDaSottotitolare, archivioCaricato ? titoloNoto(archivio.voce) : undefined)
  const subCasa = useSottotitoliCasa(fileId, infoCasa)
  const sub = casa ? subCasa : subDisco
  const usaSalvati = loc && !aperto && !disco.copiaSenzaSottotitoli

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
  const sigle = useSigleLettore(videoRef, archivio.voce, !!prossimo, vaiAlProssimo)
  const { serie, inCoda, finito, codaAutomatica } = sigle
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

  const cc = useSceltaSottotitoli(tracce)
  // La barra dei comandi di Ciak c'è a video fermo, al tocco e col mouse, e
  // sparisce dopo qualche secondo di visione; con un menu aperto resta.
  const riquadroVideo = useRef<HTMLDivElement>(null)
  const [menuSottotitoliAperto, setMenuSottotitoliAperto] = useState(false)
  const [menuAudioAperto, setMenuAudioAperto] = useState(false)
  const comandiVisibili = useComandiVisibili(riquadroVideo, videoRef, menuSottotitoliAperto || menuAudioAperto)

  // Dal server di casa un'altra lingua è un altro flusso, e il <video> si
  // rifà: riparte da dove si era.
  const ricordaPosizione = useCallback(() => {
    daRiprendere.current = posizione.current
  }, [])
  const audio = useSceltaAudio({
    fileId,
    casa,
    conVicini: disco.conVicini,
    infoCasa,
    voce: archivio.voce,
    archivioCaricato,
    primaDiCambiare: ricordaPosizione,
  })

  // Dal server di casa: il file diretto o convertito da Jellyfin (vedi
  // useFlussoCasa). Un file diretto che non parte passa da solo alla
  // conversione (vedi suErrore e segnala).
  const flusso = useFlussoCasa({ videoRef, fileId, casa, info: infoCasa, sceltaAudio: audio.scelta, onErrore: setErrore })
  const hlsCasa = flusso.hls
  const direttoCasaRef = flusso.direttoRef
  const srcVideo = casa ? flusso.src : (disco.src ?? undefined)
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

  const suTasto = useTastiera()
  useSessioneMedia({
    videoRef,
    titolo,
    poster: archivio.voce?.poster_path ?? null,
    salta,
    prossimo: prossimo ? vaiAlProssimo : null,
    precedente: precedente ? vaiAlPrecedente : null,
  })

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
        flusso.forzaConversione()
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

  // Dove la sigla c'è di sicuro il pulsante resta, come su Netflix; nel resto
  // dei primi minuti compare con la barra: fisso per tutto quel tempo dava
  // fastidio, ma sparire del tutto lo faceva mancare proprio a sigla in corso.
  const saltaSiglaInVista = sigle.siglaSaltabile && (sigle.pulsante === 'fisso' || comandiVisibili)

  // La tastiera sul computer: le azioni di questo disegno (vedi useTastiera).
  suTasto.current = (azione) => {
    if (azione === 'pausa') alternaRiproduzione()
    else if (azione === 'indietro') salta(-SALTO_TASTIERA)
    else if (azione === 'avanti') salta(SALTO_TASTIERA)
    else if (azione === 'schermo') schermo.alterna()
    else if (azione === 'sigla' && sigle.siglaSaltabile) sigle.saltaSigla()
    else if (azione === 'prossimo' && prossimo) {
      // Come il pulsante: durante la sigla finale insegna dove comincia.
      if (inCoda) sigle.prossimoDallaSigla()
      else vaiAlProssimo()
    } else if (azione === 'precedente' && precedente) vaiAlPrecedente()
    else if (azione === 'audio') {
      // Con un'altra lingua il video tace già: il muto è quello dell'audio.
      const suono = elementoAudio ?? videoRef.current
      if (suono) suono.muted = !suono.muted
    }
    else if (azione === 'sottotitoli' && tracce.length > 0) cc.scegli(cc.prossimo)
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
          onEnded={() => sigle.setFinito(true)}
          onPlay={() => sigle.setFinito(false)}
          // Un salto fallito riprende dal punto scelto, non da quello di prima;
          // uno che non finisce mai viene segnalato.
          onSeeking={(e) => {
            posizione.current = e.currentTarget.currentTime
            vigilanza.current.inizio()
          }}
          onSeeked={(e) => {
            vigilanza.current.fine()
            sigle.suSalto(e.currentTarget.currentTime)
          }}
          onPlaying={() => vigilanza.current.fine()}
          onTimeUpdate={(e) => {
            const v = e.currentTarget
            posizione.current = v.currentTime
            archivio.suTempo(v)
            sigle.suTempo(v)
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
          vtt={cc.scelto < 0 ? null : (tracce[cc.scelto]?.vtt ?? null)}
          chiaveVideo={hlsCasa ?? 'diretto'}
          scala={DIMENSIONI_SOTTOTITOLI[cc.dimensione].scala}
          sollevate={comandiVisibili}
        />
        {audio.srcAudio && (
          // Una lingua nuova è un elemento nuovo: riparte allineato al video.
          <audio key={audio.srcAudio} ref={setElementoAudio} src={audio.srcAudio} preload="auto" data-testid="audio-lingua" />
        )}
        <IndicatoreCaricamento videoRef={videoRef} />
        {loc && locale !== undefined && disco.cercatoInCartella && !disco.src && (
          <FileDaRiaprire cartellaDaRiaprire={disco.cartellaDaRiaprire} nomeFile={nomeFile} onRiaperta={disco.riapri} />
        )}
        {/* Anche col mouse: senza i comandi del browser il clic sul video
           ferma e riprende, come in ogni lettore. */}
        <ToccoVideo
          onAlterna={() => {
            schermo.concediDalTocco()
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
          onSchermoIntero={schermo.alterna}
          suono={elementoAudio}
        >
          <PulsantiEpisodi
            precedente={precedente}
            prossimo={prossimo}
            onPrecedente={vaiAlPrecedente}
            onProssimo={inCoda ? sigle.prossimoDallaSigla : vaiAlProssimo}
          />
          {audio.tracce.length > 1 && (
            <MenuAudio
              nomi={nomiTracceAudio(audio.tracce)}
              scelto={audio.scelta}
              sigla={siglaTracciaAudio(audio.traccia)}
              onScegli={audio.scegli}
              onAperto={setMenuAudioAperto}
            />
          )}
          {tracce.length > 0 && (
            <MenuSottotitoli
              nomi={cc.nomi}
              scelto={cc.scelto}
              sigla={cc.sigla}
              onScegli={cc.scegli}
              onAperto={setMenuSottotitoliAperto}
              dimensione={cc.dimensione}
              onDimensione={cc.cambiaDimensione}
            />
          )}
        </BarraLettore>
        <ComandiSigla
          saltaInVista={saltaSiglaInVista}
          onSalta={() => sigle.saltaSigla()}
          rivedi={sigle.rivedi !== null}
          onRivedi={sigle.rivediSigla}
          prossimo={inCoda || finito || codaAutomatica ? etichettaProssimo : null}
          finito={finito || codaAutomatica}
          onProssimo={sigle.prossimoDallaSigla}
        />
      </div>

      {!touch && (
        <p className="text-xs text-zinc-500">
          Dalla tastiera: spazio pausa · ← → 10 secondi · F schermo intero · M audio{tracce.length > 0 && ' · C sottotitoli'}
          {serie && ' · S salta la sigla · N episodio dopo · P episodio prima'}
        </p>
      )}

      {serie && sigle.durataSigla !== null && (
        <SigleSerie
          punti={sigle.punti}
          onReimpara={() => sigle.imparaPunti(PUNTI_VUOTI)}
          scelte={sigle.scelte}
          onScelte={sigle.cambiaScelte}
          conEsatteInizio={sigle.conEsatteInizio}
          conEsatteFine={sigle.conEsatteFine}
          esatte={sigle.testoEsatte}
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

      {loc && (
        <FileSulDisco
          fileId={fileId}
          titolo={titolo}
          aperto={aperto}
          locale={locale}
          onLocale={disco.setLocale}
          sottotitoli={sub.tracce}
          onErrore={setErrore}
        />
      )}

      <RigaSottotitoli
        testo={testoSottotitoli({
          salvati: usaSalvati,
          etichette: tracce.map((t) => t.etichetta),
          stato: sub.stato,
          messaggio: sub.messaggio,
        })}
        nomi={tracce.length > 0 ? cc.nomi : []}
        chiavi={tracce.map((t) => t.url)}
        scelto={cc.scelto}
        onScegli={cc.scegli}
        altri={!usaSalvati && sub.stato === 'pronti' ? sub.tracce.filter((t) => sub.altri[t.chiave]) : []}
        onProvaAltro={sub.provaAltro}
      />

      <NoteLettore casa={casa} diretto={flusso.diretto} />
    </div>
  )
}
