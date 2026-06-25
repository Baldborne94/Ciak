import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import { EmptyState, ErrorState, Loader } from '../components/States'
import { getList, getListItems } from '../lib/lists'
import { posterUrl } from '../lib/tmdb'
import type { UserList, UserListItem } from '../lib/types'

// Vista pubblica e in sola lettura di una lista condivisa. Accessibile senza
// login: la RLS lascia leggere solo le liste marcate `is_public`.
export default function PublicListPage() {
  const { id } = useParams<{ id: string }>()
  const [list, setList] = useState<UserList | null>(null)
  const [items, setItems] = useState<UserListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    Promise.all([getList(id), getListItems(id)])
      .then(([l, its]) => {
        setList(l)
        setItems(its)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <Loader label="Apro la lista…" />
  if (error) return <ErrorState title="Lista non disponibile" message={error} />
  if (!list || !list.is_public) {
    return (
      <ErrorState
        title="Lista non disponibile"
        message="Questa lista non esiste o non è stata resa pubblica dal proprietario."
      />
    )
  }

  return (
    <div>
      <PageHeader
        eyebrow="Lista condivisa"
        title={list.name}
        subtitle={list.description ?? undefined}
      />

      {items.length === 0 ? (
        <EmptyState title="Lista vuota" message="Questa lista non contiene ancora titoli." icon="🗂️" />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {items.map((it) => {
            const poster = posterUrl(it.poster_path)
            const type = it.media_type === 'movie' ? 'movie' : 'tv'
            return (
              <Link
                key={it.id}
                to={`/title/${type}/${it.tmdb_id}`}
                className="group overflow-hidden rounded-xl border border-theatre-800 bg-theatre-900"
              >
                <div className="aspect-[2/3] w-full overflow-hidden bg-theatre-800">
                  {poster ? (
                    <img src={poster} alt={it.title} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-4xl opacity-30">🎞️</div>
                  )}
                </div>
                <div className="p-3">
                  <h3 className="line-clamp-1 text-sm font-semibold text-zinc-100">{it.title}</h3>
                </div>
              </Link>
            )
          })}
        </div>
      )}

      <Link to="/" className="mt-8 inline-block text-sm text-projector/80 hover:text-projector">
        Scopri Ciak →
      </Link>
    </div>
  )
}
