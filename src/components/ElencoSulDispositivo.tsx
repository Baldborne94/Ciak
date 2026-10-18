import { taglia, type FilmOffline } from '../lib/filmOffline'

// In cima alla videoteca, i film salvati in Ciak sul dispositivo: si guardano
// anche senza il disco e senza rete. Uno ancora in copia o non riuscito si
// vede, ma non si apre. Gli episodi di una serie salvata stanno in una riga
// sola, che si apre: venti episodi uno sotto l'altro coprirebbero la videoteca.

type Voce = { tipo: 'film'; film: FilmOffline } | { tipo: 'serie'; nome: string; episodi: FilmOffline[] }

// Nell'ordine dell'elenco: una serie compare dove compare il suo primo episodio.
function raggruppa(film: FilmOffline[]): Voce[] {
  const voci: Voce[] = []
  const serie = new Map<string, FilmOffline[]>()
  for (const f of film) {
    if (!f.serie) {
      voci.push({ tipo: 'film', film: f })
      continue
    }
    const episodi = serie.get(f.serie)
    if (episodi) episodi.push(f)
    else {
      const nuovi = [f]
      serie.set(f.serie, nuovi)
      voci.push({ tipo: 'serie', nome: f.serie, episodi: nuovi })
    }
  }
  return voci
}

function RigaFilm({ f, onApri }: { f: FilmOffline; onApri: (f: FilmOffline) => void }) {
  return (
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
  )
}

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
        {raggruppa(film).map((v) =>
          v.tipo === 'film' ? (
            <li key={v.film.id}>
              <RigaFilm f={v.film} onApri={onApri} />
            </li>
          ) : (
            <li key={`serie-${v.nome}`}>
              <details>
                <summary className="flex cursor-pointer items-center gap-3 px-4 py-3 transition hover:bg-theatre-800/60">
                  <span className="text-xl">📺</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-zinc-100">{v.nome}</span>
                    <span className="block truncate text-xs text-zinc-500">
                      {v.episodi.length === 1 ? '1 episodio' : `${v.episodi.length} episodi`}
                      {v.episodi.some((e) => e.dimensione) && ` · ${taglia(v.episodi.reduce((t, e) => t + (e.dimensione ?? 0), 0))}`}
                    </span>
                  </span>
                </summary>
                <ul aria-label={`Episodi di ${v.nome} sul dispositivo`} className="border-t border-theatre-800 pl-6">
                  {v.episodi.map((f) => (
                    <li key={f.id}>
                      <RigaFilm f={f} onApri={onApri} />
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          ),
        )}
      </ul>
    </section>
  )
}
