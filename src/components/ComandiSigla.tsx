import ProssimoEpisodio from './ProssimoEpisodio'

// In alto a destra sopra il video, lontano dalla barra: «Salta sigla»,
// «Rivedi la sigla» e l'episodio dopo (vedi useSigleLettore).
export default function ComandiSigla({
  saltaInVista,
  onSalta,
  rivedi,
  onRivedi,
  prossimo,
  finito,
  onProssimo,
}: {
  saltaInVista: boolean
  onSalta: () => void
  // Saltata da sola: «↩ Rivedi la sigla» per qualche secondo.
  rivedi: boolean
  onRivedi: () => void
  // L'etichetta del prossimo episodio, quando è il momento di proporlo.
  prossimo: string | null
  finito: boolean
  onProssimo: () => void
}) {
  return (
    <div className="absolute right-2 top-2 flex flex-col items-end gap-2">
      {saltaInVista && (
        <button type="button" onClick={onSalta} className="rounded-xl bg-theatre-950/90 px-3 py-1.5 text-sm text-zinc-100 shadow-reel">
          ⏭ Salta sigla
        </button>
      )}
      {rivedi && (
        <button type="button" onClick={onRivedi} className="rounded-xl bg-theatre-950/90 px-3 py-1.5 text-sm text-zinc-100 shadow-reel">
          ↩ Rivedi la sigla
        </button>
      )}
      {prossimo && <ProssimoEpisodio etichetta={prossimo} finito={finito} onVai={onProssimo} />}
    </div>
  )
}
