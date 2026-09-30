import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { ErrorState } from '../components/States'
import {
  anteprimaUrl,
  apriSuDriveUrl,
  attendiLettoreCiak,
  collegaDrive,
  driveConnesso,
  flussoVideoUrl,
  idDriveValido,
  lettoreCiakDisponibile,
  titoloVideo,
} from '../lib/googleDrive'
import { useSottotitoli } from '../lib/useSottotitoli'

// Due lettori per lo stesso film:
//  - quello di Ciak, un <video> che legge il file originale da Drive (tramite
//    il service worker) e può mostrare i sottotitoli che Ciak trova da sé;
//  - quello di Google Drive, in un iframe, che converte al volo ogni formato
//    ma non accetta sottotitoli dall'esterno.
// Si parte da quello di Ciak; se il browser non legge il file o l'audio resta
// muto (tipico del Dolby E-AC3 negli MKV) lo si dice e si passa a Drive.

type Problema = 'formato' | 'muto' | 'sessione'

// Il browser sta decodificando l'audio? Ogni motore lo espone a modo suo; null
// quando non si può sapere, e allora non si avvisa.
function senzaAudio(v: HTMLVideoElement): boolean | null {
  const w = v as HTMLVideoElement & {
    webkitAudioDecodedByteCount?: number
    mozHasAudio?: boolean
    audioTracks?: { length: number }
  }
  if (typeof w.mozHasAudio === 'boolean') return !w.mozHasAudio
  if (typeof w.webkitAudioDecodedByteCount === 'number') return w.webkitAudioDecodedByteCount === 0
  if (w.audioTracks) return w.audioTracks.length === 0
  return null
}

const MESSAGGI: Record<Problema, string> = {
  formato: 'Il browser non riesce a leggere questo file. Il lettore di Drive lo converte da sé.',
  muto: 'Il video parte ma senza audio: probabilmente è in un formato (come il Dolby E-AC3) che il browser non legge. Il lettore di Drive lo converte da sé.',
  sessione: 'La sessione Google è scaduta: ricollega Google Drive per continuare da dove eri.',
}

export default function StreamingPlayerPage() {
  const { fileId = '' } = useParams()
  const stato = useLocation().state as { titolo?: string; file?: string } | null
  const valido = idDriveValido(fileId)

  const [connesso, setConnesso] = useState(driveConnesso)
  const [ciakPronto, setCiakPronto] = useState(lettoreCiakDisponibile)
  const [lettore, setLettore] = useState<'ciak' | 'drive'>(() =>
    lettoreCiakDisponibile() && driveConnesso() ? 'ciak' : 'drive',
  )
  // I sottotitoli si cercano solo quando serve davvero il lettore di Ciak: nel
  // lettore di Drive non si vedrebbero, e un download online ha un tetto.
  const [sottotitoliAttivi, setSottotitoliAttivi] = useState(lettore === 'ciak')
  const [problema, setProblema] = useState<Problema | null>(null)
  const [chiaveVideo, setChiaveVideo] = useState(0)
  const [errore, setErrore] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const posizione = useRef(0)
  const audioControllato = useRef(false)
  // Chi ha scelto a mano il lettore di Drive ci resta, anche se quello di Ciak
  // diventa pronto dopo.
  const sceltaDrive = useRef(false)

  useEffect(
    () =>
      attendiLettoreCiak(() => {
        setCiakPronto(true)
        if (!sceltaDrive.current && driveConnesso()) {
          setLettore('ciak')
          setSottotitoliAttivi(true)
        }
      }),
    [],
  )

  const sub = useSottotitoli(fileId, valido && connesso && sottotitoliAttivi)

  // Una traccia aggiunta a video già avviato non si accende da sola: la si
  // accende a mano, spegnendo le altre.
  useEffect(() => {
    const tracce = videoRef.current?.textTracks
    if (!tracce || !sub.traccia) return
    for (let i = 0; i < tracce.length; i++) tracce[i].mode = i === tracce.length - 1 ? 'showing' : 'disabled'
  }, [sub.traccia, chiaveVideo])

  const titolo =
    stato?.titolo ?? (sub.info ? titoloVideo({ name: sub.info.name, cartella: sub.cartella }) : 'Film')
  const nomeFile = stato?.file ?? sub.info?.name

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

  async function ricollega() {
    setErrore(null)
    try {
      await collegaDrive()
      setConnesso(true)
      setProblema(null)
      setChiaveVideo((k) => k + 1)
      if (ciakPronto || lettoreCiakDisponibile()) usaCiak()
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Collegamento non riuscito.')
    }
  }

  const testoSottotitoli =
    sub.stato === 'cerco'
      ? 'Cerco i sottotitoli…'
      : sub.stato === 'pronti' && sub.traccia
        ? sub.traccia.etichetta
        : sub.stato === 'nessuno'
          ? (sub.messaggio ?? 'Nessun sottotitolo, né nella cartella né su OpenSubtitles.')
          : `Sottotitoli non disponibili: ${sub.messaggio ?? 'errore sconosciuto'}`

  return (
    <div className="space-y-4">
      {indietro}
      <div>
        <h1 className="font-display text-3xl tracking-wide text-zinc-100">{titolo}</h1>
        {nomeFile && nomeFile !== titolo && <p className="mt-1 truncate text-xs text-zinc-500">{nomeFile}</p>}
      </div>

      <div className="aspect-video w-full overflow-hidden rounded-xl bg-black shadow-reel">
        {lettore === 'ciak' ? (
          <video
            key={chiaveVideo}
            ref={videoRef}
            src={flussoVideoUrl(fileId)}
            controls
            autoPlay
            playsInline
            aria-label={titolo}
            className="h-full w-full"
            onError={() => setProblema(driveConnesso() ? 'formato' : 'sessione')}
            onLoadedMetadata={(e) => {
              // Dopo un ricollegamento si riparte da dove si era.
              if (posizione.current > 0) e.currentTarget.currentTime = posizione.current
            }}
            onTimeUpdate={(e) => {
              const v = e.currentTarget
              posizione.current = v.currentTime
              if (!audioControllato.current && v.currentTime >= 3) {
                audioControllato.current = true
                if (senzaAudio(v)) setProblema('muto')
              }
            }}
          >
            {sub.traccia && (
              <track
                key={sub.traccia.url}
                kind="subtitles"
                src={sub.traccia.url}
                srcLang={sub.traccia.lingua ?? undefined}
                label={sub.traccia.etichetta.split(' · ')[0]}
                default
              />
            )}
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
      </div>

      {problema && lettore === 'ciak' && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-projector/40 bg-projector/10 p-4 text-sm text-zinc-200">
          <p className="flex-1">{MESSAGGI[problema]}</p>
          {problema === 'sessione' ? (
            <button type="button" onClick={ricollega} className="btn-primary px-3 py-2">
              Ricollega Google Drive
            </button>
          ) : (
            <button type="button" onClick={usaDrive} className="btn-primary px-3 py-2">
              Usa il lettore di Drive
            </button>
          )}
        </div>
      )}
      {errore && <p className="text-sm text-red-400">{errore}</p>}

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {lettore === 'ciak' && (
          <>
            <p className="text-zinc-300">💬 {testoSottotitoli}</p>
            {sub.altriPossibili && sub.stato === 'pronti' && (
              <button type="button" onClick={sub.provaAltro} className="btn-ghost px-3 py-1.5">
                Fuori sincrono? Prova un altro sottotitolo
              </button>
            )}
          </>
        )}
        <span className="flex-1" />
        {lettore === 'ciak' ? (
          <button type="button" onClick={usaDrive} className="btn-ghost px-3 py-1.5">
            Usa il lettore di Drive
          </button>
        ) : !connesso ? (
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

      <div className="grid gap-3 text-sm text-zinc-400 sm:grid-cols-2">
        {lettore === 'ciak' ? (
          <>
            <div className="rounded-xl border border-theatre-800 bg-theatre-900/40 p-4">
              <p className="mb-1 font-medium text-zinc-200">📺 Il lettore di Ciak</p>
              <p>
                Legge il file originale, alla sua qualità piena, anche appena caricato. I sottotitoli
                si scelgono dal pulsante CC del lettore; ⛶ per lo schermo intero.
              </p>
            </div>
            <div className="rounded-xl border border-theatre-800 bg-theatre-900/40 p-4">
              <p className="mb-1 font-medium text-zinc-200">💬 Da dove arrivano i sottotitoli</p>
              <p>
                Prima un file <code>.srt</code> accanto al film nella cartella su Drive; se manca,
                OpenSubtitles (italiano, poi inglese), e quello trovato viene salvato nella cartella
                per la volta dopo.
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
