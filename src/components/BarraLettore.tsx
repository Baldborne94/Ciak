import { useEffect, useState, type ReactNode, type RefObject } from 'react'
import { formattaTempo } from '../lib/streaming'
import { useElementoVideo } from '../lib/useElementoVideo'

// La barra dei comandi di Ciak, al posto di quella del browser. Il suo ⛶
// metteva a schermo intero il solo <video>: lì sopra Ciak non può disegnare
// niente (né i sottotitoli né «Salta sigla»), e passare allo schermo intero
// della pagina serviva un secondo clic, perché il browser lo concede una volta
// sola per gesto. Restava a metà, con schede e indirizzo in vista. Con la
// barra di Ciak il ⛶ è il nostro, e funziona al primo clic.

interface Props {
  videoRef: RefObject<HTMLVideoElement>
  visibile: boolean
  cinema: boolean // già a schermo intero
  onSchermoIntero: () => void
  children?: ReactNode // il menu dei sottotitoli
}

interface Stato {
  inPausa: boolean
  tempo: number
  durata: number | null
  muto: boolean
  volume: number
}

const VUOTO: Stato = { inPausa: true, tempo: 0, durata: null, muto: false, volume: 1 }

export default function BarraLettore({ videoRef, visibile, cinema, onSchermoIntero, children }: Props) {
  const video = useElementoVideo(videoRef)
  const [stato, setStato] = useState<Stato>(VUOTO)

  useEffect(() => {
    const v = video
    if (!v) return setStato(VUOTO)
    const leggi = () =>
      setStato({
        inPausa: v.paused,
        tempo: v.currentTime,
        durata: Number.isFinite(v.duration) && v.duration > 0 ? v.duration : null,
        muto: v.muted,
        volume: v.volume,
      })
    leggi()
    const eventi = ['play', 'pause', 'ended', 'timeupdate', 'seeked', 'durationchange', 'loadedmetadata', 'volumechange']
    eventi.forEach((e) => v.addEventListener(e, leggi))
    return () => eventi.forEach((e) => v.removeEventListener(e, leggi))
  }, [video])

  const alterna = () => {
    if (!video) return
    if (video.paused) void video.play().catch(() => {})
    else video.pause()
  }
  const vaiA = (t: number) => {
    if (!video) return
    video.currentTime = t
    setStato((s) => ({ ...s, tempo: t }))
  }
  const silenzioso = stato.muto || stato.volume === 0

  return (
    <div
      data-testid="barra-lettore"
      className={`absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/85 via-black/50 to-transparent px-3 pb-1.5 pt-8 transition-opacity duration-300 ${
        visibile ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
    >
      <input
        type="range"
        aria-label="Avanzamento"
        min={0}
        max={stato.durata ?? 0}
        step={1}
        value={Math.min(stato.tempo, stato.durata ?? 0)}
        disabled={stato.durata === null}
        onChange={(e) => vaiA(Number(e.target.value))}
        className="block h-4 w-full cursor-pointer accent-projector"
      />
      <div className="flex items-center gap-1 text-sm text-zinc-100">
        <Tasto etichetta={stato.inPausa ? 'Riproduci' : 'Pausa'} onClick={alterna}>
          {stato.inPausa ? '▶' : '⏸'}
        </Tasto>
        <span className="px-1 tabular-nums text-zinc-200">
          {formattaTempo(stato.tempo)}
          <span className="text-zinc-400"> / {stato.durata === null ? '–:––' : formattaTempo(stato.durata)}</span>
        </span>
        <span className="flex-1" />
        <Tasto
          etichetta={silenzioso ? "Riattiva l'audio" : "Togli l'audio"}
          onClick={() => {
            if (!video) return
            if (silenzioso && video.volume === 0) video.volume = 1
            video.muted = !silenzioso
          }}
        >
          {silenzioso ? '🔇' : '🔊'}
        </Tasto>
        {/* Sul telefono il volume è quello dei tasti: il cursore resta al computer. */}
        <input
          type="range"
          aria-label="Volume"
          min={0}
          max={1}
          step={0.05}
          value={stato.muto ? 0 : stato.volume}
          onChange={(e) => {
            if (!video) return
            video.volume = Number(e.target.value)
            video.muted = video.volume === 0
          }}
          className="hidden w-20 cursor-pointer accent-projector sm:block"
        />
        {children}
        <Tasto etichetta={cinema ? 'Esci dallo schermo intero' : 'Schermo intero'} onClick={onSchermoIntero}>
          ⛶
        </Tasto>
      </div>
    </div>
  )
}

function Tasto({ etichetta, onClick, children }: { etichetta: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={etichetta}
      title={etichetta}
      onClick={onClick}
      className="flex min-h-10 min-w-10 items-center justify-center rounded-lg text-lg transition hover:bg-white/10"
    >
      {children}
    </button>
  )
}
