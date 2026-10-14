import { useRef } from 'react'
import { cartellaDisponibile, cartellaScelta, collegaCartella, permessoCartella, usaFileCartella } from '../lib/cartellaLocale'
import { logFailure } from '../lib/logFailure'

// Il pulsante della cartella dei film, per collegarla o riaprirla. Chrome ed
// Edge danno una maniglia che resta (basta ridare il permesso); gli altri
// browser solo la scelta della cartella, che vale per questa visita: il
// pulsante usa da sé quella che c'è, e chi lo preme non deve saperlo.

interface Props {
  etichetta: string
  // Riaprire una cartella già collegata invece di sceglierne una nuova.
  riapri?: boolean
  className?: string
  onFatto: () => void
  onErrore?: (messaggio: string) => void
}

export default function ScegliCartella({ etichetta, riapri = false, className = 'btn-ghost', onFatto, onErrore }: Props) {
  const input = useRef<HTMLInputElement>(null)

  async function clic() {
    try {
      // Con la maniglia salvata, riaprire vuol dire solo ridare il permesso.
      if (riapri && !cartellaScelta()) {
        if (await permessoCartella(true)) onFatto()
        return
      }
      if (cartellaDisponibile()) {
        await collegaCartella()
        onFatto()
      } else input.current?.click()
    } catch (e) {
      // Finestra chiusa senza scegliere: niente da dire.
      if (e instanceof DOMException && e.name === 'AbortError') return
      onErrore?.(e instanceof Error ? e.message : 'Cartella non collegata.')
      logFailure('Collegamento della cartella dei film')(e)
    }
  }

  return (
    <>
      <input
        ref={input}
        type="file"
        multiple
        // Non è nei tipi di React, ma tutti i browser lo conoscono.
        {...{ webkitdirectory: '' }}
        aria-label="Scegli la cartella dei film"
        className="hidden"
        onChange={(e) => {
          const file = [...(e.target.files ?? [])]
          e.target.value = ''
          if (file.length === 0) return
          try {
            usaFileCartella(file)
            onFatto()
          } catch (err) {
            onErrore?.(err instanceof Error ? err.message : 'Cartella non collegata.')
            logFailure('Collegamento della cartella dei film')(err)
          }
        }}
      />
      <button type="button" onClick={() => void clic()} className={className}>
        {etichetta}
      </button>
    </>
  )
}
