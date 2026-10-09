import { useCallback, useEffect, useRef, useState } from 'react'

// I sottotitoli scelti da un menu di Ciak, nella barra del lettore. Quello del
// browser era minuscolo e sul telefono finiva sotto altri pulsanti: toccare
// «Inglese» era una lotteria. Qui ogni voce è alta quanto un dito, il menu si
// apre sopra il pulsante, e c'è anche la dimensione delle battute.
import { DIMENSIONI_SOTTOTITOLI } from '../lib/sceltaSottotitoli'
import { useChiusuraMenu } from '../lib/useChiusuraMenu'

interface Props {
  nomi: string[] // «Italiano», «Inglese», nell'ordine delle tracce
  scelto: number // -1: nessuno
  sigla: string // «IT», «off»
  onScegli: (indice: number) => void
  onAperto?: (aperto: boolean) => void // finché è aperto, la barra non sparisce
  dimensione?: number // indice in DIMENSIONI_SOTTOTITOLI
  onDimensione?: (indice: number) => void
}

export default function MenuSottotitoli({ nomi, scelto, sigla, onScegli, onAperto, dimensione, onDimensione }: Props) {
  const [aperto, setAperto] = useState(false)
  useEffect(() => onAperto?.(aperto), [aperto, onAperto])
  const contenitore = useRef<HTMLDivElement>(null)
  const pulsante = useRef<HTMLButtonElement>(null)
  const chiudi = useCallback(() => setAperto(false), [])

  useChiusuraMenu(aperto, chiudi, contenitore, pulsante)

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
        className="min-h-10 rounded-lg px-3 py-1.5 text-sm font-semibold text-zinc-100 transition hover:bg-white/10"
      >
        CC {sigla}
      </button>
      {aperto && (
        <div
          role="group"
          aria-label="Sottotitoli"
          className="absolute bottom-full right-0 z-20 mb-2 flex min-w-48 flex-col overflow-hidden rounded-xl border border-theatre-700 bg-theatre-950/95 py-1 shadow-reel"
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
          {/* La dimensione non chiude il menu: si vede subito l'effetto. */}
          {onDimensione && (
            <div role="group" aria-label="Dimensione dei sottotitoli" className="border-t border-theatre-800 px-3 py-2">
              <p className="mb-1.5 text-xs text-zinc-400">Dimensione</p>
              <div className="flex gap-1">
                {DIMENSIONI_SOTTOTITOLI.map((d, i) => (
                  <button
                    key={d.nome}
                    type="button"
                    aria-pressed={i === dimensione}
                    aria-label={d.nome}
                    title={d.nome}
                    onClick={() => onDimensione(i)}
                    className={`min-h-10 flex-1 rounded-lg transition hover:bg-white/10 ${
                      i === dimensione ? 'bg-white/15 text-projector-light' : 'text-zinc-200'
                    }`}
                    style={{ fontSize: `${12 + i * 3}px` }}
                  >
                    A
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
