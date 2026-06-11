import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import SavedTitleCard from '../components/SavedTitleCard'
import { EmptyState, ErrorState, Loader } from '../components/States'
import { useAuth } from '../lib/auth'
import { listFavorites, refFromMedia, upsertUserTitle } from '../lib/userTitles'
import { listEntities } from '../lib/entities'
import { profileUrl, logoUrl } from '../lib/tmdb'
import type { SavedEntity, UserTitle } from '../lib/types'

type Tab = 'titles' | 'people' | 'studios'

const TABS: { value: Tab; label: string; icon: string }[] = [
  { value: 'titles', label: 'Titoli', icon: '🎬' },
  { value: 'people', label: 'Persone', icon: '🌟' },
  { value: 'studios', label: 'Studi', icon: '🏛️' },
]

type SortKey = 'rating' | 'updated' | 'title'

function StarRating({
  value,
  onChange,
}: {
  value: number | null
  onChange: (v: number) => void
}) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          onClick={() => onChange(star)}
          className={`text-lg leading-none transition ${
            value && star <= value ? 'text-projector' : 'text-theatre-700 hover:text-projector/60'
          }`}
          title={`${star}/5`}
        >
          ★
        </button>
      ))}
    </div>
  )
}

function FavoriteEditor({
  record,
  onSaved,
}: {
  record: UserTitle
  onSaved: (next: UserTitle) => void
}) {
  const { user } = useAuth()
  const [notes, setNotes] = useState(record.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dirty = notes !== (record.notes ?? '')

  async function save(patch: Parameters<typeof upsertUserTitle>[2]) {
    if (!user) return
    setSaving(true)
    setError(null)
    try {
      const next = await upsertUserTitle(
        user.id,
        refFromMedia({
          id: record.tmdb_id,
          mediaType: record.media_type === 'movie' ? 'movie' : 'tv',
          title: record.title,
          originalTitle: null,
          posterPath: record.poster_path,
          overview: '',
          backdropPath: null,
          releaseDate: null,
          voteAverage: 0,
          genreIds: record.genre_ids ?? [],
          originalLanguage: null,
        }),
        patch,
      )
      onSaved(next)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-2">
      <StarRating value={record.personal_rating} onChange={(v) => save({ personal_rating: v })} />
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Note personali…"
        rows={2}
        className="w-full resize-none rounded-md border border-theatre-700 bg-theatre-900 px-2 py-1 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-projector/50 focus:outline-none"
      />
      <div className="flex items-center justify-between">
        <button
          onClick={() => save({ notes })}
          disabled={saving || !dirty}
          className="text-xs text-projector disabled:text-zinc-600"
        >
          {saving ? 'Salvo…' : dirty ? 'Salva note' : 'Salvato'}
        </button>
        {error && <span className="text-xs text-curtain-light">{error}</span>}
      </div>
    </div>
  )
}

function TitlesTab() {
  const { user } = useAuth()
  const [items, setItems] = useState<UserTitle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sort, setSort] = useState<SortKey>('rating')

  useEffect(() => {
    if (!user) return
    setLoading(true)
    setError(null)
    listFavorites(user.id)
      .then(setItems)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [user])

  function replace(next: UserTitle) {
    setItems((prev) => prev.map((r) => (r.id === next.id ? next : r)))
  }

  const sorted = [...items].sort((a, b) => {
    if (sort === 'title') return a.title.localeCompare(b.title)
    if (sort === 'updated') return b.updated_at.localeCompare(a.updated_at)
    return (b.personal_rating ?? 0) - (a.personal_rating ?? 0)
  })

  if (loading) return <Loader label="Apro la tua collezione…" />
  if (error) return <ErrorState title="Impossibile caricare i preferiti" message={error} />
  if (sorted.length === 0)
    return (
      <EmptyState
        title="Nessun titolo preferito"
        message="Segna un titolo come preferito dalla sua scheda: qui potrai votarlo e annotare i tuoi commenti."
        icon="❤️"
      />
    )

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="input-cine w-auto"
        >
          <option value="rating">Ordina per voto</option>
          <option value="updated">Più recenti</option>
          <option value="title">Titolo (A–Z)</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {sorted.map((record) => (
          <SavedTitleCard key={record.id} record={record}>
            <FavoriteEditor record={record} onSaved={replace} />
          </SavedTitleCard>
        ))}
      </div>
    </div>
  )
}

function EntitiesTab({ type }: { type: 'person' | 'company' }) {
  const { user } = useAuth()
  const [items, setItems] = useState<SavedEntity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    setLoading(true)
    setError(null)
    listEntities(user.id, type)
      .then(setItems)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [user, type])

  if (loading) return <Loader label="Apro la tua collezione…" />
  if (error) return <ErrorState title="Impossibile caricare i preferiti" message={error} />
  if (items.length === 0)
    return (
      <EmptyState
        title={type === 'person' ? 'Nessuna persona preferita' : 'Nessuno studio preferito'}
        message={
          type === 'person'
            ? 'Apri il profilo di un attore o regista e premi «Aggiungi ai preferiti».'
            : 'Apri la pagina di uno studio e premi «Aggiungi ai preferiti».'
        }
        icon={type === 'person' ? '🌟' : '🏛️'}
      />
    )

  if (type === 'person') {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {items.map((e) => {
          const photo = profileUrl(e.image_path)
          return (
            <Link
              key={e.id}
              to={`/person/${e.entity_id}`}
              className="group rounded-xl border border-theatre-800 bg-theatre-900 p-3 text-center transition hover:-translate-y-1 hover:border-projector/40"
            >
              <div className="mx-auto aspect-square w-full overflow-hidden rounded-full border border-theatre-700 bg-theatre-800">
                {photo ? (
                  <img src={photo} alt={e.name} loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-3xl opacity-30">👤</div>
                )}
              </div>
              <p className="mt-2 line-clamp-1 text-sm font-semibold text-zinc-100">{e.name}</p>
              {e.subtitle && <p className="line-clamp-1 text-xs text-zinc-500">{e.subtitle}</p>}
            </Link>
          )
        })}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
      {items.map((e) => {
        const logo = logoUrl(e.image_path)
        return (
          <Link
            key={e.id}
            to={`/studio/${e.entity_id}`}
            className="group flex h-32 flex-col items-center justify-center gap-3 rounded-xl border border-theatre-800 bg-theatre-900 p-4 text-center transition hover:-translate-y-1 hover:border-projector/40"
          >
            {logo ? (
              <img src={logo} alt={e.name} loading="lazy" className="max-h-14 max-w-[80%] rounded bg-white/90 px-3 py-2" />
            ) : (
              <span className="text-4xl opacity-40">🏛️</span>
            )}
            <p className="line-clamp-1 text-sm font-medium text-zinc-200">{e.name}</p>
          </Link>
        )
      })}
    </div>
  )
}

export default function Favorites() {
  const [tab, setTab] = useState<Tab>('titles')

  return (
    <div>
      <PageHeader
        eyebrow="La tua collezione"
        title="Preferiti"
        subtitle="Titoli, persone e studi che ami — divisi per sezione."
      />

      <div className="mb-8 flex gap-2 border-b border-theatre-800">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`-mb-px border-b-2 px-4 py-3 text-sm font-medium transition ${
              tab === t.value
                ? 'border-projector text-projector'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === 'titles' && <TitlesTab />}
      {tab === 'people' && <EntitiesTab type="person" />}
      {tab === 'studios' && <EntitiesTab type="company" />}
    </div>
  )
}
