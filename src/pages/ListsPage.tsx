import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import { EmptyState, ErrorState, Loader } from '../components/States'
import { useAuth } from '../lib/auth'
import { createList, listLists } from '../lib/lists'
import type { UserList } from '../lib/types'

export default function ListsPage() {
  const { user } = useAuth()
  const [lists, setLists] = useState<UserList[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (!user) return
    setLoading(true)
    listLists(user.id)
      .then(setLists)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [user])

  async function create() {
    if (!user || !name.trim()) return
    setCreating(true)
    try {
      const list = await createList(user.id, name.trim(), null)
      setLists((prev) => [{ ...list, item_count: 0 }, ...prev])
      setName('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Le tue raccolte"
        title="Liste personali"
        subtitle="Crea collezioni tematiche: «Neo-noir», «Da vedere con lei», «Palme d'Oro»…"
      />

      <div className="mb-8 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && create()}
          placeholder="Nome della nuova lista…"
          className="input-cine"
        />
        <button onClick={create} disabled={creating || !name.trim()} className="btn-primary whitespace-nowrap">
          ➕ Crea
        </button>
      </div>

      {loading ? (
        <Loader label="Apro le tue liste…" />
      ) : error ? (
        <ErrorState title="Impossibile caricare le liste" message={error} />
      ) : lists.length === 0 ? (
        <EmptyState
          title="Nessuna lista, per ora"
          message="Crea la tua prima raccolta tematica qui sopra, poi aggiungi titoli dalle loro schede."
          icon="🗂️"
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {lists.map((l) => (
            <Link
              key={l.id}
              to={`/liste/${l.id}`}
              className="rounded-xl border border-theatre-800 bg-theatre-900/60 p-5 transition hover:-translate-y-1 hover:border-projector/40"
            >
              <h3 className="font-display text-xl tracking-wide text-projector">{l.name}</h3>
              {l.description && <p className="mt-1 text-sm text-zinc-400">{l.description}</p>}
              <p className="mt-3 text-xs text-zinc-500">
                {l.item_count ?? 0} {l.item_count === 1 ? 'titolo' : 'titoli'}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
