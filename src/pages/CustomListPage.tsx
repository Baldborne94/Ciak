import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import { EmptyState, ErrorState, Loader } from '../components/States'
import { useAuth } from '../lib/auth'
import { useToast } from '../lib/toastCtx'
import { deleteList, getList, getListItems, removeFromList, setListPublic, updateList } from '../lib/lists'
import { posterUrl } from '../lib/tmdb'
import { useLibrary } from '../lib/libraryCtx'
import LibraryBadge from '../components/LibraryBadge'
import type { UserList, UserListItem } from '../lib/types'

export default function CustomListPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const { lookup } = useLibrary()
  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [draftDesc, setDraftDesc] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [list, setList] = useState<UserList | null>(null)
  const [items, setItems] = useState<UserListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updatingVisibility, setUpdatingVisibility] = useState(false)

  const shareUrl = id ? `${window.location.origin}/lista/${id}` : ''

  async function toggleVisibility() {
    if (!id || !list) return
    const next = !list.is_public
    setUpdatingVisibility(true)
    setList({ ...list, is_public: next }) // ottimistico
    try {
      await setListPublic(id, next)
      if (next) {
        await copyShareLink()
      } else {
        showToast('Lista resa privata.', 'info')
      }
    } catch (e) {
      setList({ ...list, is_public: !next }) // rollback
      showToast(`Non sono riuscito ad aggiornare la visibilità: ${(e as Error).message}`)
    } finally {
      setUpdatingVisibility(false)
    }
  }

  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(shareUrl)
      showToast('Link copiato negli appunti!', 'success')
    } catch {
      showToast(`Link condivisibile: ${shareUrl}`, 'info')
    }
  }

  useEffect(() => {
    if (!id || !user) return
    setLoading(true)
    Promise.all([getList(id), getListItems(id)])
      .then(([l, its]) => {
        setList(l)
        setItems(its)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [id, user])

  async function remove(item: UserListItem) {
    if (!id) return
    await removeFromList(id, item.tmdb_id, item.media_type)
    setItems((prev) => prev.filter((i) => i.id !== item.id))
  }

  function startEdit() {
    if (!list) return
    setDraftName(list.name)
    setDraftDesc(list.description ?? '')
    setEditing(true)
  }

  // Rinomina e descrizione: prima un nome sbagliato si correggeva solo
  // cancellando la lista e rifacendola — perdendo tutti i titoli — e la
  // descrizione non era scrivibile da nessuna parte, pur essendo mostrata
  // nell'elenco.
  async function saveEdit() {
    if (!list || !draftName.trim()) return
    setSavingEdit(true)
    try {
      const aggiornata = await updateList(list.id, {
        name: draftName.trim(),
        description: draftDesc.trim() || null,
      })
      setList(aggiornata)
      setEditing(false)
    } catch (e) {
      showToast(`Non sono riuscito a salvare: ${(e as Error).message}`, 'error')
    } finally {
      setSavingEdit(false)
    }
  }

  async function onDelete() {
    if (!id || !confirm('Eliminare questa lista? I titoli non verranno persi dalle altre sezioni.')) return
    await deleteList(id)
    navigate('/liste')
  }

  if (loading) return <Loader label="Apro la lista…" />
  if (error) return <ErrorState title="Lista non disponibile" message={error} />
  if (!list) return <ErrorState title="Lista non trovata" message="Forse è stata eliminata." />

  return (
    <div>
      <PageHeader eyebrow="Lista personale" title={list.name} subtitle={list.description ?? undefined}>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={toggleVisibility}
            disabled={updatingVisibility}
            className="btn-ghost"
            title={list.is_public ? 'Chiunque con il link può vederla' : 'Solo tu puoi vederla'}
          >
            {list.is_public ? '🌍 Pubblica' : '🔒 Privata'}
          </button>
          <button onClick={startEdit} className="btn-ghost">
            ✏️ Rinomina
          </button>
          <button onClick={onDelete} className="btn-ghost text-curtain-light">
            🗑️ Elimina lista
          </button>
        </div>
      </PageHeader>

      {editing && (
        <div className="mb-6 space-y-3 rounded-xl border border-theatre-700 bg-theatre-900/60 p-4">
          <div>
            <label htmlFor="lista-nome" className="text-xs uppercase tracking-wider text-zinc-500">
              Nome
            </label>
            <input
              id="lista-nome"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
              className="input-cine mt-1"
            />
          </div>
          <div>
            <label htmlFor="lista-desc" className="text-xs uppercase tracking-wider text-zinc-500">
              Descrizione (facoltativa)
            </label>
            <input
              id="lista-desc"
              value={draftDesc}
              onChange={(e) => setDraftDesc(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
              placeholder="A cosa serve questa lista…"
              className="input-cine mt-1"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={saveEdit}
              disabled={savingEdit || !draftName.trim()}
              className="btn-primary"
            >
              {savingEdit ? 'Salvo…' : 'Salva'}
            </button>
            <button onClick={() => setEditing(false)} className="btn-ghost">
              Annulla
            </button>
          </div>
        </div>
      )}

      {list.is_public && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-projector/30 bg-projector/5 px-4 py-3">
          <span className="text-sm text-zinc-300">🔗 Lista condivisibile:</span>
          <code className="flex-1 truncate rounded bg-theatre-950/60 px-2 py-1 text-xs text-projector">
            {shareUrl}
          </code>
          <button onClick={copyShareLink} className="btn-primary px-3 py-1.5 text-sm">
            Copia link
          </button>
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState
          title="Lista vuota"
          message="Apri la scheda di un titolo e usa «Aggiungi a lista» per metterlo qui."
          icon="🗂️"
        />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {items.map((it) => {
            const poster = posterUrl(it.poster_path)
            const type = it.media_type === 'movie' ? 'movie' : 'tv'
            // Lo stesso badge del resto dell'app: dentro una raccolta «da
            // vedere» sapere cosa hai già guardato è l'informazione che serve
            // di più, e qui mancava perché queste card sono disegnate a mano.
            const lib = lookup(type, it.tmdb_id)
            return (
              <div key={it.id} className="group relative overflow-hidden rounded-xl border border-theatre-800 bg-theatre-900">
                <Link to={`/title/${type}/${it.tmdb_id}`} className="block">
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
                {lib && <LibraryBadge status={lib.status} isFavorite={lib.isFavorite} />}
                <button
                  onClick={() => remove(it)}
                  aria-label="Rimuovi dalla lista"
                  className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-theatre-950/80 text-sm text-zinc-300 opacity-0 transition hover:bg-curtain hover:text-white group-hover:opacity-100"
                >
                  ✕
                </button>
              </div>
            )
          })}
        </div>
      )}

      <Link to="/liste" className="mt-8 inline-block text-sm text-projector/80 hover:text-projector">
        ← Tutte le liste
      </Link>
    </div>
  )
}
