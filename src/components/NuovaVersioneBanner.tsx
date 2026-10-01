import { useCallback, useEffect, useState } from 'react'
import { eNuova, VERSIONE_APP, versionePubblicata } from '../lib/versione'

// Ciak è una pagina sola: una scheda aperta da ieri continua a usare il codice
// di ieri, anche dopo un aggiornamento. Qui ci si accorge che online c'è una
// versione più nuova e lo si dice, invece di lasciare che una correzione
// appena pubblicata sembri non funzionare.

// Ogni quanto si ricontrolla con la scheda aperta.
export const OGNI_MS = 10 * 60_000

interface Props {
  versione?: string
  controlla?: () => Promise<string | null>
  ricarica?: () => void
}

export default function NuovaVersioneBanner({
  versione = VERSIONE_APP,
  controlla = versionePubblicata,
  ricarica = () => window.location.reload(),
}: Props) {
  const [nuova, setNuova] = useState<string | null>(null)
  const [rimandata, setRimandata] = useState<string | null>(null)

  const verifica = useCallback(async () => {
    if (versione === 'dev' || !navigator.onLine) return
    const pubblicata = await controlla()
    if (eNuova(versione, pubblicata)) setNuova(pubblicata)
  }, [versione, controlla])

  useEffect(() => {
    void verifica()
    const timer = setInterval(() => void verifica(), OGNI_MS)
    // Tornando sulla scheda (o sull'app, dal tablet) e quando torna la rete:
    // sono i momenti in cui è più probabile che sia uscito qualcosa.
    const suVisibile = () => {
      if (document.visibilityState === 'visible') void verifica()
    }
    document.addEventListener('visibilitychange', suVisibile)
    window.addEventListener('online', verifica)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', suVisibile)
      window.removeEventListener('online', verifica)
    }
  }, [verifica])

  // «Più tardi» vale per questa versione: se ne esce un'altra, si riavvisa.
  if (!nuova || nuova === rimandata) return null

  return (
    <div role="status" className="border-b border-projector/40 bg-projector/10">
      <div className="container-cine flex flex-wrap items-center gap-3 py-3 text-sm text-zinc-200">
        <span aria-hidden="true">✨</span>
        <p className="flex-1">
          <span className="font-semibold">È disponibile una nuova versione di Ciak.</span> Aggiorna per avere le
          ultime novità e correzioni.
        </p>
        <button type="button" onClick={ricarica} className="btn-primary px-3 py-1.5 text-sm">
          Aggiorna
        </button>
        <button type="button" onClick={() => setRimandata(nuova)} className="btn-ghost px-3 py-1.5 text-sm">
          Più tardi
        </button>
      </div>
    </div>
  )
}
