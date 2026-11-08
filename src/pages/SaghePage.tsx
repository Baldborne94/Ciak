import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import MediaGrid from '../components/MediaGrid'
import AlertButton from '../components/AlertButton'
import { EmptyState, ErrorState, Loader } from '../components/States'
import { FilterBar, ChipGroup } from '../components/FilterBar'
import { displayTitle, posterUrl } from '../lib/tmdb'
import { nomeSaga } from '../lib/saghe'
import { filtraSaghe, type FiltroSaghe, type RiepilogoSaga } from '../lib/sagheDaCompletare'
import { useSagheDaCompletare } from '../lib/useSagheDaCompletare'
import type { MediaItem } from '../lib/types'

// «Saghe da completare»: le saghe di cui hai visto almeno un film, quanto ti
// manca di ognuna, e i capitoli che devono ancora uscire con «Avvisami».

const FILTRI: { value: FiltroSaghe; label: string }[] = [
  { value: 'da-completare', label: 'Da completare' },
  { value: 'in-arrivo', label: 'Con film in arrivo' },
  { value: 'tutte', label: 'Tutte' },
]

function data(iso: string | null): string {
  if (!iso) return 'Data da annunciare'
  return new Date(`${iso}T00:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })
}

function InArrivo({ film, avvisato }: { film: MediaItem; avvisato: boolean }) {
  const poster = posterUrl(film.posterPath, 'w185')
  return (
    <li className="flex items-center gap-3 rounded-lg border border-theatre-800 bg-theatre-900/40 p-2">
      <Link to={`/title/movie/${film.id}`} className="flex min-w-0 flex-1 items-center gap-3">
        {poster ? (
          <img src={poster} alt="" loading="lazy" className="h-16 w-11 shrink-0 rounded object-cover" />
        ) : (
          <span className="flex h-16 w-11 shrink-0 items-center justify-center rounded bg-theatre-800 opacity-40">🎞️</span>
        )}
        <span className="min-w-0">
          <span className="line-clamp-1 text-sm font-medium text-zinc-100">{displayTitle(film)}</span>
          <span className="text-xs text-projector/80">{data(film.releaseDate)}</span>
        </span>
      </Link>
      <div className="w-28 shrink-0">
        <AlertButton
          item={{ tmdbId: film.id, mediaType: 'movie', title: film.title, posterPath: film.posterPath, releaseDate: film.releaseDate }}
          active={avvisato}
        />
      </div>
    </li>
  )
}

function Saga({ s, avvisi }: { s: RiepilogoSaga; avvisi: Set<string> }) {
  const nome = nomeSaga(s.nome)
  return (
    <section aria-label={nome} className="rounded-2xl border border-theatre-800 bg-theatre-900/30 p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-2xl tracking-wide text-zinc-100">
          <Link to={`/collection/${s.id}`} className="hover:text-projector">
            📚 {nome}
          </Link>
        </h2>
        <p className="text-sm text-zinc-300">
          {s.mancanti.length === 0 ? '✓ Completa: ' : '✓ Ne hai visti '}
          <strong>{s.visti}</strong> su {s.usciti}
        </p>
      </div>
      <div
        role="progressbar"
        aria-label={`${nome}: film visti`}
        aria-valuemin={0}
        aria-valuemax={s.usciti}
        aria-valuenow={s.visti}
        className="mb-4 h-1.5 overflow-hidden rounded-full bg-theatre-800"
      >
        <div className="h-full bg-emerald-500" style={{ width: `${s.usciti ? (s.visti / s.usciti) * 100 : 0}%` }} />
      </div>
      {s.mancanti.length > 0 && (
        <>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Ti mancano</h3>
          <MediaGrid items={s.mancanti} />
        </>
      )}
      {s.inArrivo.length > 0 && (
        <>
          <h3 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wider text-zinc-500">In arrivo</h3>
          <ul className="grid gap-2 sm:grid-cols-2">
            {s.inArrivo.map((f) => (
              // Gli avvisi arrivano a parte: la chiave rifà il pulsante quando
              // si sa che era già acceso.
              <InArrivo key={`${f.id}-${avvisi.has(`movie-${f.id}`)}`} film={f} avvisato={avvisi.has(`movie-${f.id}`)} />
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

export default function SaghePage() {
  const { saghe, avvisi, progresso, errore } = useSagheDaCompletare()
  const [filtro, setFiltro] = useState<FiltroSaghe>('da-completare')
  const mostrate = useMemo(() => filtraSaghe(saghe ?? [], filtro), [saghe, filtro])

  return (
    <div>
      <PageHeader
        eyebrow="Da recuperare"
        title="Saghe da completare"
        subtitle="Le saghe di cui hai visto almeno un film: cosa ti manca, e cosa deve ancora uscire."
      />
      <FilterBar>
        <ChipGroup options={FILTRI} value={filtro} onChange={setFiltro} />
      </FilterBar>

      {errore ? (
        <ErrorState title="Saghe non disponibili" message={errore} />
      ) : !saghe ? (
        <Loader label={progresso ? `Cerco le saghe dei tuoi film… ${progresso.fatti} di ${progresso.totale}` : 'Cerco le saghe dei tuoi film…'} />
      ) : mostrate.length === 0 ? (
        <EmptyState
          icon="📚"
          title={saghe.length === 0 ? 'Nessuna saga' : filtro === 'in-arrivo' ? 'Nessun film in arrivo' : 'Le hai completate tutte'}
          message={
            saghe.length === 0
              ? 'Segna come visto un film che fa parte di una saga e la troverai qui.'
              : filtro === 'in-arrivo'
                ? 'Nessuna delle tue saghe ha capitoli annunciati, per ora.'
                : 'Delle saghe che hai cominciato non ti manca nessun film uscito.'
          }
        />
      ) : (
        <div className="space-y-6">
          {mostrate.map((s) => (
            <Saga key={s.id} s={s} avvisi={avvisi} />
          ))}
        </div>
      )}
      <p className="mt-8 text-center text-xs text-zinc-500">
        «Avvisami» manda una notifica quando il film esce; le date si aggiornano da sole se cambiano.
      </p>
    </div>
  )
}
