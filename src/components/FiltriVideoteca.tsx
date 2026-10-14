import { filterSelectClass } from './FilterBar'
import { ORDINI_VIDEOTECA, type OrdineVideoteca } from '../lib/videoteca'

// Sopra l'elenco della videoteca: ricerca, ordine, genere, i titoli da
// sistemare e «Crea una saga», col conto dei titoli quando un filtro ne nasconde.
export default function FiltriVideoteca({
  query,
  onQuery,
  ordine,
  onOrdine,
  generi,
  genere,
  onGenere,
  daSistemare,
  soloDaSistemare,
  onSoloDaSistemare,
  onCreaSaga,
  mostrati,
  totale,
}: {
  query: string
  onQuery: (q: string) => void
  ordine: OrdineVideoteca
  onOrdine: (o: OrdineVideoteca) => void
  generi: { id: number; nome: string; quanti: number }[]
  genere: number | null
  onGenere: (g: number | null) => void
  // Quanti titoli sono da sistemare, e se si stanno mostrando solo loro.
  daSistemare: number
  soloDaSistemare: boolean
  onSoloDaSistemare: () => void
  // Assente quando non c'è nessun film fra cui comporre una saga.
  onCreaSaga: (() => void) | null
  mostrati: number
  totale: number
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <input
        type="search"
        aria-label="Cerca nella videoteca"
        placeholder="🔍 Cerca un titolo…"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        className={`${filterSelectClass} min-w-0 flex-1 sm:max-w-xs`}
      />
      <select aria-label="Ordina la videoteca" value={ordine} onChange={(e) => onOrdine(e.target.value as OrdineVideoteca)} className={filterSelectClass}>
        {ORDINI_VIDEOTECA.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {generi.length > 0 && (
        <select
          aria-label="Filtra per genere"
          value={genere ?? ''}
          onChange={(e) => onGenere(e.target.value ? Number(e.target.value) : null)}
          className={filterSelectClass}
        >
          <option value="">Tutti i generi</option>
          {generi.map((g) => (
            <option key={g.id} value={g.id}>
              {g.nome} ({g.quanti})
            </option>
          ))}
        </select>
      )}
      {daSistemare > 0 && (
        <button
          type="button"
          aria-pressed={soloDaSistemare}
          onClick={onSoloDaSistemare}
          className={`rounded-lg border px-3 py-1.5 text-sm transition ${
            soloDaSistemare ? 'border-projector/60 bg-projector/10 text-projector' : 'border-theatre-700 text-zinc-400 hover:text-zinc-100'
          }`}
        >
          ⚠ Da sistemare {daSistemare}
        </button>
      )}
      {onCreaSaga && (
        <button
          type="button"
          onClick={onCreaSaga}
          className="rounded-lg border border-theatre-700 px-3 py-1.5 text-sm text-zinc-400 transition hover:text-zinc-100"
        >
          ＋ Crea una saga
        </button>
      )}
      {mostrati !== totale && (
        <span className="text-sm text-zinc-500">
          {mostrati} di {totale}
        </span>
      )}
    </div>
  )
}
