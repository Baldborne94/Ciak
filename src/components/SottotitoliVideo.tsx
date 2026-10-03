import { useEffect, useMemo, useState, type RefObject } from 'react'
import { battuteAl, leggiVtt } from '../lib/vtt'

// Le battute disegnate da Ciak sopra il video (vedi `lib/vtt`): il <video>
// resta senza tracce, così il browser non mostra il suo CC in basso. Mentre
// il video va si segue ogni fotogramma: `timeupdate` arriva quattro volte al
// secondo, e una battuta in ritardo di un quarto di secondo si nota.
//
// La misura segue l'altezza del riquadro, come nei lettori di streaming: una
// misura fissa era enorme nella pagina e giusta solo a schermo intero. Sopra
// ci va la correzione scelta da chi guarda (`scala`).

// Quanto è alta una riga rispetto al video: Netflix sta intorno al 5%.
const QUOTA_ALTEZZA = 0.045
const MINIMO_PX = 13

interface Props {
  videoRef: RefObject<HTMLVideoElement>
  contenitore: RefObject<HTMLElement> // il riquadro del lettore, per la misura
  vtt: string | null // null: nessun sottotitolo
  chiaveVideo: string // il <video> cambia a ogni episodio: si riaggancia
  scala?: number // 1 = medi (vedi DIMENSIONI_SOTTOTITOLI)
  sollevate?: boolean // con la barra dei comandi in vista si alzano sopra di lei
}

export default function SottotitoliVideo({ videoRef, contenitore, vtt, chiaveVideo, scala = 1, sollevate = false }: Props) {
  const battute = useMemo(() => (vtt ? leggiVtt(vtt) : []), [vtt])
  const [testo, setTesto] = useState('')
  const [altezza, setAltezza] = useState(0)

  useEffect(() => {
    const c = contenitore.current
    if (!c) return
    setAltezza(c.clientHeight)
    // jsdom non ha ResizeObserver: lì vale la misura letta una volta.
    if (typeof ResizeObserver === 'undefined') return
    const oss = new ResizeObserver(() => setAltezza(c.clientHeight))
    oss.observe(c)
    return () => oss.disconnect()
  }, [contenitore, chiaveVideo])

  useEffect(() => {
    const v = videoRef.current
    if (!v || battute.length === 0) {
      setTesto('')
      return
    }
    let giro = 0
    const aggiorna = () => setTesto(battuteAl(battute, v.currentTime))
    const segui = () => {
      aggiorna()
      giro = requestAnimationFrame(segui)
    }
    const parti = () => {
      cancelAnimationFrame(giro)
      segui()
    }
    const ferma = () => {
      cancelAnimationFrame(giro)
      aggiorna()
    }
    v.addEventListener('play', parti)
    v.addEventListener('pause', ferma)
    v.addEventListener('ended', ferma)
    v.addEventListener('seeked', aggiorna)
    v.addEventListener('timeupdate', aggiorna)
    if (v.paused) aggiorna()
    else parti()
    return () => {
      cancelAnimationFrame(giro)
      v.removeEventListener('play', parti)
      v.removeEventListener('pause', ferma)
      v.removeEventListener('ended', ferma)
      v.removeEventListener('seeked', aggiorna)
      v.removeEventListener('timeupdate', aggiorna)
    }
  }, [videoRef, battute, chiaveVideo])

  if (!testo) return null
  const dimensione = Math.max(MINIMO_PX, altezza * QUOTA_ALTEZZA * scala)
  return (
    // Trasparente ai tocchi: sotto c'è il video, che col tocco si ferma e
    // riparte. Con la barra in vista si alza, per non finirle sotto.
    <div
      data-testid="sottotitoli"
      data-dimensione={Math.round(dimensione)}
      className={`pointer-events-none absolute inset-x-0 flex justify-center px-4 text-center transition-[bottom] duration-300 ${
        sollevate ? 'bottom-24' : 'bottom-[6%]'
      }`}
    >
      <p
        className="max-w-[85%] whitespace-pre-line text-white"
        style={{ fontSize: `${dimensione}px`, lineHeight: 1.35, textShadow: '0 0 4px #000, 0 0 2px #000' }}
      >
        <span className="rounded bg-black/70 px-2 py-0.5 [box-decoration-break:clone] [-webkit-box-decoration-break:clone]">
          {testo}
        </span>
      </p>
    </div>
  )
}
