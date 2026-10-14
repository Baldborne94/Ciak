import { taglia, type FilmOffline } from '../lib/filmOffline'

// In cima alla videoteca, i film salvati in Ciak sul dispositivo: si guardano
// anche senza il disco e senza rete. Uno ancora in copia o non riuscito si
// vede, ma non si apre.
export default function ElencoSulDispositivo({
  film,
  spazioUsato,
  onApri,
}: {
  film: FilmOffline[]
  spazioUsato: number | null
  onApri: (f: FilmOffline) => void
}) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 flex items-baseline gap-2 text-sm font-semibold uppercase tracking-wider text-zinc-500">
        📱 Sul dispositivo
        {spazioUsato !== null && (
          <span className="font-normal normal-case tracking-normal text-zinc-600">· {taglia(spazioUsato)} usati da Ciak</span>
        )}
      </h2>
      <ul className="divide-y divide-theatre-800 rounded-2xl border border-theatre-800 bg-theatre-900/40">
        {film.map((f) => (
          <li key={f.id}>
            <button
              onClick={() => onApri(f)}
              disabled={f.stato !== 'completo'}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-theatre-800/60 disabled:opacity-60"
            >
              <span className="text-xl">{f.stato === 'completo' ? '📱' : f.stato === 'in-corso' ? '⬇️' : '⚠️'}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-zinc-100">{f.titolo}</span>
                <span className="block truncate text-xs text-zinc-500">
                  {f.stato === 'completo'
                    ? `Disponibile offline${f.dimensione ? ` · ${taglia(f.dimensione)}` : ''}`
                    : f.stato === 'in-corso'
                      ? 'Download in corso…'
                      : `Download non riuscito${f.errore ? ` · ${f.errore}` : ''}`}
                </span>
              </span>
              {f.stato === 'completo' && <span className="shrink-0 text-projector">▶ Guarda</span>}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
