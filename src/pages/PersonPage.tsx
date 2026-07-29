import { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import MediaGrid from '../components/MediaGrid'
import { EmptyState, ErrorState, Loader } from '../components/States'
import { getPersonDetail, profileUrl, isTmdbConfigured } from '../lib/tmdb'
import EntityFavoriteButton from '../components/EntityFavoriteButton'
import { FilterBar, ChipGroup, RatingSlider, filterSelectClass } from '../components/FilterBar'
import { YEARS } from '../lib/filters'
import type { MediaItem, PersonDetail } from '../lib/types'

type CreditKind = 'all' | 'movie' | 'tv'
const KIND_OPTS: { value: CreditKind; label: string }[] = [
  { value: 'all', label: 'Tutti' },
  { value: 'movie', label: 'Film' },
  { value: 'tv', label: 'Serie TV' },
]

function calcAge(birthday: string): number {
  const diff = Date.now() - new Date(birthday).getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25))
}

export default function PersonPage() {
  const { id } = useParams<{ id: string }>()
  const [person, setPerson] = useState<PersonDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filmography filters (client-side: credits are already loaded).
  const [kind, setKind] = useState<CreditKind>('all')
  const [minVote, setMinVote] = useState(0)
  const [year, setYear] = useState('')
  const [sort, setSort] = useState<'popularity' | 'date_desc' | 'date_asc' | 'rating_desc'>('popularity')

  useEffect(() => {
    if (!id) return
    if (!isTmdbConfigured) {
      setError('Configura VITE_TMDB_API_KEY per vedere i profili.')
      setLoading(false)
      return
    }
    setLoading(true)
    // Reset filters when navigating to a different person.
    setKind('all'); setMinVote(0); setYear(''); setSort('popularity')
    getPersonDetail(Number(id))
      .then(setPerson)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  const filteredCredits = useMemo(() => {
    const credits = person?.credits ?? []
    const list = credits.filter((c: MediaItem) => {
      if (kind !== 'all' && c.mediaType !== kind) return false
      if (c.voteAverage < minVote) return false
      if (year && c.releaseDate?.slice(0, 4) !== year) return false
      return true
    })
    const byDate = (a: MediaItem, b: MediaItem, dir: 'asc' | 'desc') => {
      if (!a.releaseDate && !b.releaseDate) return 0
      if (!a.releaseDate) return 1
      if (!b.releaseDate) return -1
      return dir === 'asc'
        ? a.releaseDate.localeCompare(b.releaseDate)
        : b.releaseDate.localeCompare(a.releaseDate)
    }
    if (sort === 'date_desc') return [...list].sort((a, b) => byDate(a, b, 'desc'))
    if (sort === 'date_asc') return [...list].sort((a, b) => byDate(a, b, 'asc'))
    if (sort === 'rating_desc') return [...list].sort((a, b) => b.voteAverage - a.voteAverage)
    return list
  }, [person, kind, minVote, year, sort])

  if (loading) return <Loader label="Carico il profilo…" />
  if (error) return <ErrorState title="Profilo non disponibile" message={error} />
  if (!person) return null

  const photo = profileUrl(person.profilePath)
  const credits = person.credits

  return (
    <div className="space-y-10">
      <div className="flex flex-col gap-6 sm:flex-row">
        <div className="w-40 flex-shrink-0 sm:w-52">
          {photo ? (
            <img
              src={photo}
              alt={person.name}
              className="w-full rounded-xl border border-theatre-700 shadow-reel"
            />
          ) : (
            <div className="flex aspect-[2/3] items-center justify-center rounded-xl bg-theatre-800 text-5xl">
              👤
            </div>
          )}
        </div>

        <div className="flex-1">
          <h1 className="font-display text-4xl tracking-wide text-zinc-100 sm:text-5xl">
            {person.name}
          </h1>
          {person.knownFor && (
            <p className="mt-1 text-sm font-semibold uppercase tracking-wider text-projector/80">
              {person.knownFor}
            </p>
          )}

          <div className="mt-4 space-y-1 text-sm text-zinc-400">
            {person.birthday && (
              <p>
                🎂 {new Date(person.birthday).toLocaleDateString('it-IT')}
                {' '}({calcAge(person.birthday)} anni)
              </p>
            )}
            {person.placeOfBirth && <p>📍 {person.placeOfBirth}</p>}
          </div>

          {person.biography && (
            <p className="mt-5 max-w-2xl whitespace-pre-line text-sm leading-relaxed text-zinc-300 line-clamp-[12]">
              {person.biography}
            </p>
          )}

          <EntityFavoriteButton
            entity={{
              entityType: 'person',
              entityId: person.id,
              name: person.name,
              imagePath: person.profilePath,
              subtitle: person.knownFor,
            }}
          />
        </div>
      </div>

      {credits.length > 0 && (
        <section>
          <h2 className="mb-4 font-display text-2xl tracking-wide text-zinc-100">
            🎬 Filmografia ({filteredCredits.length}{filteredCredits.length !== credits.length ? ` di ${credits.length}` : ''})
          </h2>

          <FilterBar>
            <ChipGroup options={KIND_OPTS} value={kind} onChange={setKind} />
            <RatingSlider value={minVote} onChange={setMinVote} />
            <select value={year} onChange={(e) => setYear(e.target.value)} className={filterSelectClass}>
              <option value="">Anno: qualsiasi</option>
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as typeof sort)}
              className={filterSelectClass}
            >
              <option value="popularity">Ordina: popolarità</option>
              <option value="date_desc">Più recenti</option>
              <option value="date_asc">Meno recenti</option>
              <option value="rating_desc">Voto più alto</option>
            </select>
          </FilterBar>

          {filteredCredits.length === 0 ? (
            <EmptyState title="Nessun titolo" message="Nessun titolo con i filtri attuali." />
          ) : (
            <MediaGrid items={filteredCredits} />
          )}
        </section>
      )}

      <Link
        to="/search"
        className="inline-block text-sm text-projector/80 hover:text-projector"
      >
        ← Torna alla ricerca
      </Link>
    </div>
  )
}
