import { useEffect, useMemo, useState, type RefObject } from 'react'
import { battuteAl, leggiVtt, type Posizione, type RigheInVista } from '../lib/vtt'

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

const NIENTE: RigheInVista = { basso: '', centro: '', alto: '' }

// Le battute in basso seguono la barra dei comandi; quelle in alto (cartelli e
// scritte tradotte, vedi lib/vtt) e a metà restano dove sono.
function posto(posizione: Posizione, sollevate: boolean): string {
  if (posizione === 'alto') return 'top-[8%]'
  if (posizione === 'centro') return 'top-1/2 -translate-y-1/2'
  return sollevate ? 'bottom-24' : 'bottom-[6%]'
}

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
  const [righe, setRighe] = useState<RigheInVista>(NIENTE)
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
      setRighe(NIENTE)
      return
    }
    let giro = 0
    // Lo stesso oggetto se non è cambiato niente: a ogni fotogramma un oggetto
    // nuovo vorrebbe dire ridisegnare per niente sessanta volte al secondo.
    const aggiorna = () =>
      setRighe((prima) => {
        const ora = battuteAl(battute, v.currentTime)
        return ora.basso === prima.basso && ora.centro === prima.centro && ora.alto === prima.alto ? prima : ora
      })
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

  const dimensione = Math.max(MINIMO_PX, altezza * QUOTA_ALTEZZA * scala)
  const posizioni: Posizione[] = ['alto', 'centro', 'basso']
  return (
    <>
      {posizioni.map((p) =>
        righe[p] ? (
          // Trasparente ai tocchi: sotto c'è il video, che col tocco si ferma e
          // riparte. In basso, con la barra in vista, si alza per non finirle sotto.
          <div
            key={p}
            data-testid={p === 'basso' ? 'sottotitoli' : `sottotitoli-${p}`}
            data-dimensione={Math.round(dimensione)}
            className={`pointer-events-none absolute inset-x-0 flex justify-center px-4 text-center transition-[bottom] duration-300 ${posto(p, sollevate)}`}
          >
            <p
              className="max-w-[85%] whitespace-pre-line text-white"
              style={{ fontSize: `${dimensione}px`, lineHeight: 1.35, textShadow: '0 0 4px #000, 0 0 2px #000' }}
            >
              <span className="rounded bg-black/70 px-2 py-0.5 [box-decoration-break:clone] [-webkit-box-decoration-break:clone]">
                {righe[p]}
              </span>
            </p>
          </div>
        ) : null,
      )}
    </>
  )
}
