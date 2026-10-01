import { useEffect, useRef, useState } from 'react'
import { SECONDI_AL_PROSSIMO } from '../lib/sigle'

// L'episodio dopo, sopra il video. Durante la sigla finale è un pulsante per
// saltarla; a episodio finito parte un conto alla rovescia e poi l'episodio
// dopo, come una maratona. «Annulla» (o ✕ durante la sigla) ferma tutto per
// questo episodio: chi l'ha chiuso non vuole che riparta da solo.

interface Props {
  etichetta: string // «S1E2», «Speciale 3»
  finito: boolean
  onVai: () => void
  secondi?: number
}

export default function ProssimoEpisodio({ etichetta, finito, onVai, secondi = SECONDI_AL_PROSSIMO }: Props) {
  const [chiuso, setChiuso] = useState(false)
  const [restano, setRestano] = useState(secondi)
  // Una volta sola: la pagina che si ridisegna mentre cambia episodio non
  // deve farlo partire due volte.
  const partito = useRef(false)

  // Il conto riparte ogni volta che l'episodio finisce: chi torna indietro e
  // lo rivede fino in fondo non trova il conto già a metà.
  useEffect(() => {
    if (!finito || chiuso) return
    setRestano(secondi)
    const giro = setInterval(() => setRestano((s) => s - 1), 1000)
    return () => clearInterval(giro)
  }, [finito, chiuso, secondi])

  useEffect(() => {
    if (!finito || chiuso || restano > 0 || partito.current) return
    partito.current = true
    onVai()
  }, [finito, chiuso, restano, onVai])

  if (chiuso) return null

  return (
    <div
      role="region"
      aria-label="Prossimo episodio"
      className="flex items-center gap-2 rounded-xl border border-theatre-700 bg-theatre-950/90 p-2 text-sm text-zinc-100 shadow-reel"
    >
      {finito ? (
        <>
          <span className="px-1">
            {etichetta} fra {Math.max(0, restano)} s
          </span>
          <button type="button" onClick={onVai} className="btn-primary px-3 py-1.5">
            ▶ Guarda ora
          </button>
          <button type="button" onClick={() => setChiuso(true)} className="btn-ghost px-3 py-1.5">
            Annulla
          </button>
        </>
      ) : (
        <>
          <button type="button" onClick={onVai} className="btn-primary px-3 py-1.5">
            ⏭ Prossimo episodio: {etichetta}
          </button>
          <button
            type="button"
            onClick={() => setChiuso(true)}
            aria-label="Non passare al prossimo episodio"
            className="btn-ghost px-2 py-1.5"
          >
            ✕
          </button>
        </>
      )}
    </div>
  )
}
