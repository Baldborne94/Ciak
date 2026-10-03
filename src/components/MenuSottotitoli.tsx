import { useEffect, useRef, useState } from 'react'

// I sottotitoli scelti sopra il video, da un menu di Ciak. Quello del browser
// è minuscolo, sta attaccato alla barra in basso e sul telefono finiva sotto i
// pulsanti ⛶ e CC: toccare «Inglese» era una lotteria. Qui ogni voce è alta
// quanto un dito, e il menu si apre sotto il pulsante che lo chiama.

interface Props {
  nomi: string[] // «Italiano», «Inglese», nell'ordine delle tracce
  scelto: number // -1: nessuno
  sigla: string // «IT», «off»
  onScegli: (indice: number) => void
}

export default function MenuSottotitoli({ nomi, scelto, sigla, onScegli }: Props) {
  const [aperto, setAperto] = useState(false)
  const contenitore = useRef<HTMLDivElement>(null)
  const pulsante = useRef<HTMLButtonElement>(null)

  // Si chiude toccando fuori o con Esc, come ogni menu.
  useEffect(() => {
    if (!aperto) return
    const fuori = (e: PointerEvent) => {
      if (!contenitore.current?.contains(e.target as Node)) setAperto(false)
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // Prima del lettore: Esc chiude il menu, non lo schermo intero.
      e.stopPropagation()
      setAperto(false)
      pulsante.current?.focus()
    }
    document.addEventListener('pointerdown', fuori)
    window.addEventListener('keydown', esc, true)
    return () => {
      document.removeEventListener('pointerdown', fuori)
      window.removeEventListener('keydown', esc, true)
    }
  }, [aperto])

  const voci = [{ indice: -1, nome: 'Nessuno' }, ...nomi.map((nome, indice) => ({ indice, nome }))]

  return (
    <div ref={contenitore} className="relative">
      <button
        ref={pulsante}
        type="button"
        onClick={() => setAperto((a) => !a)}
        aria-haspopup="true"
        aria-expanded={aperto}
        aria-label={`Sottotitoli: ${scelto < 0 ? 'nessuno' : nomi[scelto]}. Cambia`}
        title="Cambia i sottotitoli"
        className="min-h-10 rounded-lg bg-black/50 px-3 py-1.5 text-sm font-semibold text-zinc-200 opacity-70 transition hover:opacity-100"
      >
        CC {sigla}
      </button>
      {aperto && (
        <div
          role="group"
          aria-label="Sottotitoli"
          className="absolute right-0 top-full z-10 mt-2 flex min-w-40 flex-col overflow-hidden rounded-xl border border-theatre-700 bg-theatre-950/95 py-1 shadow-reel"
        >
          {voci.map(({ indice, nome }) => (
            <button
              key={indice}
              type="button"
              aria-pressed={indice === scelto}
              onClick={() => {
                onScegli(indice)
                setAperto(false)
              }}
              className={`flex min-h-12 items-center gap-3 px-4 text-left text-base transition hover:bg-white/10 ${
                indice === scelto ? 'font-semibold text-projector-light' : 'text-zinc-100'
              }`}
            >
              <span aria-hidden className="w-4">
                {indice === scelto ? '✓' : ''}
              </span>
              {nome}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
