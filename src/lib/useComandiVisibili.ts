import { useEffect, useRef, useState, type RefObject } from 'react'
import { useElementoVideo } from './useElementoVideo'

// La barra dei comandi di Ciak (vedi BarraLettore) si comporta come quella
// dei lettori di streaming: ci sono a video fermo e quando si tocca il video o si
// muove il mouse, e sparisce dopo qualche secondo di visione. Fissa copriva
// l'immagine per tutto il film.

export const MS_COMANDI = 3000

export function useComandiVisibili(
  contenitore: RefObject<HTMLElement>,
  videoRef: RefObject<HTMLVideoElement>,
  trattieni = false, // un menu aperto non sparisce sotto le dita
): boolean {
  const [mosso, setMosso] = useState(true)
  const [inPausa, setInPausa] = useState(true)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const video = useElementoVideo(videoRef)

  useEffect(() => {
    const c = contenitore.current
    if (!c) return
    const mostra = () => {
      setMosso(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setMosso(false), MS_COMANDI)
    }
    // Il mouse che esce dal video li nasconde subito, come fa il browser; un
    // dito che si alza invece no: è appena arrivato.
    const esce = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      clearTimeout(timer.current)
      setMosso(false)
    }
    mostra()
    // In cattura: il tocco sul video lo prende ToccoVideo, che non lo lascia
    // salire come click, ma passa prima di qui.
    c.addEventListener('pointerdown', mostra, true)
    c.addEventListener('pointermove', mostra, true)
    c.addEventListener('keydown', mostra, true)
    c.addEventListener('pointerleave', esce)
    return () => {
      clearTimeout(timer.current)
      c.removeEventListener('pointerdown', mostra, true)
      c.removeEventListener('pointermove', mostra, true)
      c.removeEventListener('keydown', mostra, true)
      c.removeEventListener('pointerleave', esce)
    }
  }, [contenitore])

  useEffect(() => {
    const v = video
    if (!v) {
      setInPausa(true)
      return
    }
    const aggiorna = () => setInPausa(v.paused)
    aggiorna()
    v.addEventListener('play', aggiorna)
    v.addEventListener('pause', aggiorna)
    v.addEventListener('ended', aggiorna)
    return () => {
      v.removeEventListener('play', aggiorna)
      v.removeEventListener('pause', aggiorna)
      v.removeEventListener('ended', aggiorna)
    }
  }, [video])

  return inPausa || mosso || trattieni
}
