import { useCallback, useMemo, useState } from 'react'
import PageHeader from '../components/PageHeader'
import MediaCard from '../components/MediaCard'
import { EmptyState, ErrorState, Loader } from '../components/States'
import { FilterBar, FilterGroup, ChipGroup } from '../components/FilterBar'
import { useLibrary } from '../lib/libraryCtx'
import { usePremi } from '../lib/usePremi'
import { PREMI, type Premio } from '../lib/premi'
import type { MediaItem } from '../lib/types'

// I vincitori dei grandi premi, anno per anno, con quanti ne hai visti: la
// lista da spuntare di chi vuole recuperare il canone. I dati vengono da
// Wikidata (vedi premi.ts), le card da TMDB.

type Visione = 'tutti' | 'mancano' | 'visti'
const VISIONE: { value: Visione; label: string }[] = [
  { value: 'tutti', label: 'Tutti' },
  { value: 'mancano', label: 'Mi mancano' },
  { value: 'visti', label: 'Visti' },
]
const ORDINI: { value: 'recenti' | 'vecchi'; label: string }[] = [
  { value: 'recenti', label: 'Più recenti' },
  { value: 'vecchi', label: 'Dal primo' },
]

export default function PremiPage() {
  const [premio, setPremio] = useState<Premio>('oscar')
  const [visione, setVisione] = useState<Visione>('tutti')
  const [ordine, setOrdine] = useState<'recenti' | 'vecchi'>('recenti')
  const { vincitori, film, errore, mancanti } = usePremi(premio)
  const { lookup } = useLibrary()
  const scelto = PREMI.find((p) => p.id === premio) ?? PREMI[0]

  const visto = useCallback((tmdbId: number) => lookup('movie', tmdbId)?.status === 'watched', [lookup])
  const quantiVisti = (vincitori ?? []).filter((v) => visto(v.tmdbId)).length

  const righe = useMemo(() => {
    const tutte = (vincitori ?? []).filter((v) => (visione === 'visti' ? visto(v.tmdbId) : visione === 'mancano' ? !visto(v.tmdbId) : true))
    return ordine === 'recenti' ? tutte : [...tutte].reverse()
  }, [vincitori, visione, ordine, visto])

  return (
    <div>
      <PageHeader eyebrow="Premi" title={scelto.nome} subtitle={`${scelto.dove}: tutti i vincitori, anno per anno.`} />

      <FilterBar>
        <FilterGroup label="Premio">
          <ChipGroup options={PREMI.map((p) => ({ value: p.id, label: p.nome }))} value={premio} onChange={setPremio} />
        </FilterGroup>
        <FilterGroup label="Mostra">
          <ChipGroup options={VISIONE} value={visione} onChange={setVisione} />
        </FilterGroup>
        <FilterGroup label="Ordine">
          <ChipGroup options={ORDINI} value={ordine} onChange={setOrdine} />
        </FilterGroup>
      </FilterBar>

      {errore ? (
        <ErrorState title="Wikidata non risponde" message={`La lista dei premi arriva da Wikidata, che ora non risponde (${errore}). Riprova più tardi.`} />
      ) : !vincitori ? (
        <Loader label="Cerco i vincitori…" />
      ) : (
        <>
          <div className="mb-6 max-w-md">
            <p className="text-sm text-zinc-300">
              ✓ Ne hai visti <strong>{quantiVisti}</strong> su {vincitori.length}
            </p>
            <div
              role="progressbar"
              aria-label={`${scelto.nome} visti`}
              aria-valuemin={0}
              aria-valuemax={vincitori.length}
              aria-valuenow={quantiVisti}
              className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-theatre-800"
            >
              <div className="h-full bg-emerald-500" style={{ width: `${vincitori.length ? (quantiVisti / vincitori.length) * 100 : 0}%` }} />
            </div>
          </div>

          {righe.length === 0 ? (
            <EmptyState
              icon="🏅"
              title={visione === 'mancano' ? 'Li hai visti tutti' : 'Nessun film'}
              message={visione === 'mancano' ? `Hai visto ogni ${scelto.nome}. Prova un altro premio.` : 'Non hai ancora visto nessuno di questi film.'}
            />
          ) : (
            <ol aria-label={`Vincitori: ${scelto.nome}`} className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {righe.map((v, i) => {
                const item: MediaItem | undefined = film.get(v.tmdbId)
                return (
                  <li key={v.qid}>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-projector/80">{v.anno ?? 'Anno ?'}</p>
                    {item ? (
                      <MediaCard item={item} priority={i < 5} />
                    ) : (
                      // La card arriva da TMDB poco dopo: intanto il titolo da Wikidata.
                      <div className="flex aspect-[2/3] items-center justify-center rounded-xl border border-theatre-800 bg-theatre-900/40 p-3 text-center text-sm text-zinc-400">
                        {v.titolo || 'Carico…'}
                      </div>
                    )}
                  </li>
                )
              })}
            </ol>
          )}

          {mancanti > 0 && (
            <p className="mt-6 text-xs text-zinc-500">
              {mancanti === 1 ? 'Di 1 film' : `Di ${mancanti} film`} TMDB non ha mandato la scheda: resta il titolo, senza locandina.
            </p>
          )}
          <p className="mt-8 text-center text-xs text-zinc-500">
            Vincitori da Wikidata, l’archivio libero di Wikipedia: se manca un film, di solito è perché lì non ha ancora il collegamento a TMDB.
          </p>
        </>
      )}
    </div>
  )
}
