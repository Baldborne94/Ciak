import { useEffect, useState } from 'react'
import PageHeader from '../components/PageHeader'
import SavedTitleCard from '../components/SavedTitleCard'
import { EmptyState, ErrorState, Loader } from '../components/States'
import { useAuth } from '../lib/auth'
import { listFavorites, refFromMedia, upsertUserTitle } from '../lib/userTitles'
import type { UserTitle } from '../lib/types'

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
          posterPath: record.poster_path,
          overview: '',
          backdropPath: null,
          releaseDate: null,
          voteAverage: 0,
          genreIds: record.genre_ids ?? [],
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

export default function Favorites() {
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
    setItems((prev) =>
      // A title can be un-favorited from its detail page; keep it here until reload.
      prev.map((r) => (r.id === next.id ? next : r)),
    )
  }

  const sorted = [...items].sort((a, b) => {
    if (sort === 'title') return a.title.localeCompare(b.title)
    if (sort === 'updated') return b.updated_at.localeCompare(a.updated_at)
    return (b.personal_rating ?? 0) - (a.personal_rating ?? 0)
  })

  return (
    <div>
      <PageHeader
        eyebrow="La tua collezione"
        title="Preferiti"
        subtitle="I titoli che ami, con voto personale (1–5 ★) e note."
      >
        {items.length > 0 && (
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="input-cine w-auto"
          >
            <option value="rating">Ordina per voto</option>
            <option value="updated">Più recenti</option>
            <option value="title">Titolo (A–Z)</option>
          </select>
        )}
      </PageHeader>

      {loading ? (
        <Loader label="Apro la tua collezione…" />
      ) : error ? (
        <ErrorState title="Impossibile caricare i preferiti" message={error} />
      ) : sorted.length === 0 ? (
        <EmptyState
          title="Nessun preferito, per ora"
          message="Segna un titolo come preferito dalla sua scheda: qui potrai votarlo e annotare i tuoi commenti."
          icon="❤️"
        />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {sorted.map((record) => (
            <SavedTitleCard key={record.id} record={record}>
              <FavoriteEditor record={record} onSaved={replace} />
            </SavedTitleCard>
          ))}
        </div>
      )}
    </div>
  )
}
