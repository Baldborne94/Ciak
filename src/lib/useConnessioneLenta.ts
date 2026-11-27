import { useEffect, useRef, type RefObject } from 'react'
import { connessioneLenta, LUNGA_MS, type Attesa } from './connessioneLenta'
import { useElementoVideo } from './useElementoVideo'

// Dopo un salto il video aspetta il pezzo nuovo: per un po' non è la rete lenta.
const DOPO_UN_SALTO_MS = 4000

// Guarda le attese del <video> e chiama `onLenta` una volta, quando sono
// troppe (vedi connessioneLenta). Solo da `attivo`: non per i file del
// disco, né quando la qualità è già ridotta.
export function useConnessioneLenta(videoRef: RefObject<HTMLVideoElement>, attivo: boolean, onLenta: () => void) {
  const video = useElementoVideo(videoRef)
  const chiama = useRef(onLenta)
  chiama.current = onLenta
  useEffect(() => {
    const v = video
    if (!v || !attivo) return
    const attese: Attesa[] = []
    let partito = false
    let ultimoSalto = Number.NEGATIVE_INFINITY
    let fatto = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const controlla = () => {
      if (fatto || !connessioneLenta(attese, Date.now())) return
      fatto = true
      chiama.current()
    }
    const aspetta = () => {
      if (!partito || v.paused || Date.now() - ultimoSalto < DOPO_UN_SALTO_MS) return
      if (attese.some((a) => a.fine === null)) return
      attese.push({ inizio: Date.now(), fine: null })
      controlla()
      // Un'attesa lunga si scopre solo aspettando: il <video> non lo dice.
      clearTimeout(timer)
      timer = setTimeout(controlla, LUNGA_MS + 100)
    }
    const riparte = () => {
      partito = true
      clearTimeout(timer)
      for (const a of attese) if (a.fine === null) a.fine = Date.now()
    }
    const salta = () => {
      ultimoSalto = Date.now()
    }
    v.addEventListener('waiting', aspetta)
    v.addEventListener('playing', riparte)
    v.addEventListener('seeking', salta)
    return () => {
      clearTimeout(timer)
      v.removeEventListener('waiting', aspetta)
      v.removeEventListener('playing', riparte)
      v.removeEventListener('seeking', salta)
    }
  }, [video, attivo])
}
