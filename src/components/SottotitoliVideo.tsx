import { useEffect, useMemo, useState, type RefObject } from 'react'
import { battuteAl, leggiVtt } from '../lib/vtt'

// Le battute disegnate da Ciak sopra il video (vedi `lib/vtt`): il <video>
// resta senza tracce, così il browser non mostra il suo CC in basso. Mentre
// il video va si segue ogni fotogramma: `timeupdate` arriva quattro volte al
// secondo, e una battuta in ritardo di un quarto di secondo si nota.

interface Props {
  videoRef: RefObject<HTMLVideoElement>
  vtt: string | null // null: nessun sottotitolo
  chiaveVideo: string // il <video> cambia a ogni episodio: si riaggancia
}

export default function SottotitoliVideo({ videoRef, vtt, chiaveVideo }: Props) {
  const battute = useMemo(() => (vtt ? leggiVtt(vtt) : []), [vtt])
  const [testo, setTesto] = useState('')

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
  return (
    // Sopra la barra dei comandi del browser, e trasparente ai tocchi: sotto
    // c'è il video, che col tocco si ferma e riparte.
    <div
      data-testid="sottotitoli"
      className="pointer-events-none absolute inset-x-0 bottom-16 flex justify-center px-4 text-center"
    >
      <p
        className="whitespace-pre-line text-white"
        style={{ fontSize: 'clamp(15px, 2.6vw, 34px)', lineHeight: 1.35, textShadow: '0 0 4px #000, 0 0 2px #000' }}
      >
        <span className="rounded bg-black/70 px-2 py-0.5 [box-decoration-break:clone] [-webkit-box-decoration-break:clone]">
          {testo}
        </span>
      </p>
    </div>
  )
}
