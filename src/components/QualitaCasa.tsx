import type { RefObject } from 'react'
import { useConnessioneLenta } from '../lib/useConnessioneLenta'

// Sotto il lettore, per i video del server di casa: quando la rete non tiene
// il passo (troppe attese, vedi connessioneLenta) chiede la qualità ridotta,
// e mentre è ridotta lo dice, con il modo di tornare a quella piena.
// `onCambia(true)` riduce, `onCambia(false)` torna alla piena: chi lo usa
// riprende dal punto in cui si era.
export default function QualitaCasa({
  videoRef,
  attivo,
  ridotta,
  onCambia,
}: {
  videoRef: RefObject<HTMLVideoElement>
  attivo: boolean
  ridotta: boolean
  onCambia: (ridurre: boolean) => void
}) {
  useConnessioneLenta(videoRef, attivo && !ridotta, () => onCambia(true))
  if (!attivo || !ridotta) return null
  return (
    <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl border border-theatre-800 bg-theatre-900/40 p-3 text-sm">
      <p className="flex-1 text-zinc-400">
        📶 La rete non teneva il passo e il video si fermava a caricare: lo guardi in qualità ridotta (720p), più leggera.
      </p>
      <button type="button" onClick={() => onCambia(false)} className="btn-ghost px-3 py-1.5">
        Torna alla qualità piena
      </button>
    </div>
  )
}
