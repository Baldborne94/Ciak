import { useEffect, useRef, useState } from 'react'

// Sul telefono e sul tablet un tocco sul video lo ferma o lo fa ripartire,
// come nelle app di streaming: i comandi del browser al primo tocco si
// limitano a comparire, e per la pausa serviva un secondo tocco nel punto
// giusto. Due tocchi rapidi ai lati saltano di dieci secondi, come facevano i
// comandi di Chrome che questo strato copre.
//
// La striscia in basso resta scoperta: lì ci sono la barra del tempo e gli
// altri comandi del browser.

// Quanto si aspetta un secondo tocco prima di decidere che era uno solo.
export const ATTESA_DOPPIO_MS = 250
export const SALTO_SECONDI = 10

type Segnale = '▶' | '⏸' | '⏪ 10 s' | '10 s ⏩'

export default function ToccoVideo({
  onAlterna,
  onSalta,
}: {
  // Mette in pausa o fa ripartire; risponde se ora il video è in pausa.
  onAlterna: () => boolean
  onSalta: (secondi: number) => void
}) {
  const inAttesa = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [segnale, setSegnale] = useState<{ testo: Segnale; n: number } | null>(null)
  useEffect(() => () => {
    if (inAttesa.current) clearTimeout(inAttesa.current)
  }, [])
  useEffect(() => {
    if (!segnale) return
    const via = setTimeout(() => setSegnale(null), 700)
    return () => clearTimeout(via)
  }, [segnale])
  const mostra = (testo: Segnale) => setSegnale((s) => ({ testo, n: (s?.n ?? 0) + 1 }))

  function tocco(e: React.MouseEvent<HTMLButtonElement>) {
    if (inAttesa.current) {
      // Il secondo tocco: un salto, dal lato toccato. Al centro non vuol dire niente.
      clearTimeout(inAttesa.current)
      inAttesa.current = null
      const r = e.currentTarget.getBoundingClientRect()
      const x = r.width > 0 ? (e.clientX - r.left) / r.width : 0.5
      if (x < 1 / 3) {
        onSalta(-SALTO_SECONDI)
        mostra('⏪ 10 s')
      } else if (x > 2 / 3) {
        onSalta(SALTO_SECONDI)
        mostra('10 s ⏩')
      }
      return
    }
    inAttesa.current = setTimeout(() => {
      inAttesa.current = null
      mostra(onAlterna() ? '⏸' : '▶')
    }, ATTESA_DOPPIO_MS)
  }

  return (
    <button
      type="button"
      aria-label="Pausa o riprendi"
      onClick={tocco}
      // Niente zoom col doppio tocco, niente riquadro blu al tocco.
      className="absolute inset-x-0 top-0 bottom-16 flex touch-manipulation items-center justify-center [-webkit-tap-highlight-color:transparent]"
    >
      {segnale && (
        <span key={segnale.n} aria-hidden="true" className="rounded-full bg-black/60 px-4 py-2 text-2xl text-zinc-100">
          {segnale.testo}
        </span>
      )}
    </button>
  )
}
