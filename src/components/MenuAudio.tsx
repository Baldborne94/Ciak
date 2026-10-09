import { useCallback, useEffect, useRef, useState } from 'react'
import { useChiusuraMenu } from '../lib/useChiusuraMenu'

// La lingua dell'audio, accanto al CC nella barra del lettore: c'è solo per i
// video con più di una lingua (vedi tracceAudio.ts). Fatto come il menu dei
// sottotitoli, voci alte un dito che si aprono sopra il pulsante.

interface Props {
  nomi: string[] // «Giapponese», «Italiano», nell'ordine delle tracce
  scelto: number
  sigla: string // «JA», «IT»
  onScegli: (indice: number) => void
  onAperto?: (aperto: boolean) => void // finché è aperto, la barra non sparisce
}

export default function MenuAudio({ nomi, scelto, sigla, onScegli, onAperto }: Props) {
  const [aperto, setAperto] = useState(false)
  useEffect(() => onAperto?.(aperto), [aperto, onAperto])
  const contenitore = useRef<HTMLDivElement>(null)
  const pulsante = useRef<HTMLButtonElement>(null)
  const chiudi = useCallback(() => setAperto(false), [])
  useChiusuraMenu(aperto, chiudi, contenitore, pulsante)

  return (
    <div ref={contenitore} className="relative">
      <button
        ref={pulsante}
        type="button"
        onClick={() => setAperto((a) => !a)}
        aria-haspopup="true"
        aria-expanded={aperto}
        aria-label={`Audio: ${nomi[scelto] ?? ''}. Cambia lingua`}
        title="Cambia la lingua dell'audio"
        className="min-h-10 rounded-lg px-3 py-1.5 text-sm font-semibold text-zinc-100 transition hover:bg-white/10"
      >
        🗣 {sigla}
      </button>
      {aperto && (
        <div
          role="group"
          aria-label="Lingua dell'audio"
          className="absolute bottom-full right-0 z-20 mb-2 flex min-w-48 flex-col overflow-hidden rounded-xl border border-theatre-700 bg-theatre-950/95 py-1 shadow-reel"
        >
          {nomi.map((nome, indice) => (
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
