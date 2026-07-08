import { useEffect, useState } from 'react'
import PageHeader from '../components/PageHeader'
import SavedTitleCard from '../components/SavedTitleCard'
import { EmptyState, ErrorState, Loader } from '../components/States'
import { useAuth } from '../lib/auth'
import { useToast } from '../lib/toastCtx'
import {
  getWatchlistPublic,
  listByStatus,
  listWatchlist,
  setWatchlistPublic,
  upsertUserTitle,
} from '../lib/userTitles'
import { STATUS_LABELS, type TitleStatus, type UserTitle } from '../lib/types'

const COPY: Record<TitleStatus, { subtitle: string; icon: string }> = {
  watched: { subtitle: 'Tutti i titoli che hai già guardato.', icon: '✅' },
  to_watch: {
    subtitle: 'La tua watchlist: cosa guardare alla prossima serata.',
    icon: '🎟️',
  },
  in_progress: {
    subtitle: 'Serie e anime che stai seguendo in questo momento.',
    icon: '▶️',
  },
  abandoned: { subtitle: 'Titoli iniziati ma lasciati a metà.', icon: '🚪' },
}

export default function ListPage({ status }: { status: TitleStatus }) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const copy = COPY[status]
  const [items, setItems] = useState<UserTitle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Condivisione: disponibile solo per la watchlist "Da vedere".
  const shareable = status === 'to_watch'
  const [isPublic, setIsPublic] = useState(false)
  const [updatingShare, setUpdatingShare] = useState(false)
  const shareUrl = user ? `${window.location.origin}/watchlist/${user.id}` : ''

  useEffect(() => {
    if (!user) return
    setLoading(true)
    setError(null)
    // La watchlist "Da vedere" include anche i film visti marcati "Da rivedere".
    const load = status === 'to_watch' ? listWatchlist(user.id) : listByStatus(user.id, status)
    load
      .then(setItems)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [user, status])

  useEffect(() => {
    if (!user || !shareable) return
    getWatchlistPublic(user.id).then(setIsPublic).catch(() => setIsPublic(false))
  }, [user, shareable])

  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(shareUrl)
      showToast('Link copiato negli appunti!', 'success')
    } catch {
      showToast(`Link condivisibile: ${shareUrl}`, 'info')
    }
  }

  // Recupera una serie/film abbandonato: torna "In corso" (o "Da vedere" per i
  // film) e sparisce da questa lista, come chiesto per poterla riprendere.
  async function resume(record: UserTitle) {
    if (!user) return
    // In pratica user_titles.media_type è sempre 'movie' o 'tv' (anime/cartoni
    // sono serie TV filtrate lato client): normalizziamo per TitleRef/TmdbType.
    const isTv = record.media_type === 'tv'
    setItems((prev) => prev.filter((r) => r.id !== record.id)) // ottimistico
    try {
      await upsertUserTitle(
        user.id,
        {
          tmdbId: record.tmdb_id,
          mediaType: isTv ? 'tv' : 'movie',
          title: record.title,
          posterPath: record.poster_path,
          genreIds: record.genre_ids,
        },
        { status: isTv ? 'in_progress' : 'to_watch' },
      )
      showToast('Ripreso! Lo trovi di nuovo tra i tuoi titoli attivi.', 'success')
    } catch (e) {
      setItems((prev) => [...prev, record])
      showToast(`Non sono riuscito a riprenderlo: ${(e as Error).message}`)
    }
  }

  async function toggleShare() {
    if (!user) return
    const next = !isPublic
    setUpdatingShare(true)
    setIsPublic(next) // ottimistico
    try {
      await setWatchlistPublic(user.id, next)
      if (next) await copyShareLink()
      else showToast('Watchlist resa privata.', 'info')
    } catch (e) {
      setIsPublic(!next) // rollback
      showToast(`Non sono riuscito ad aggiornare la condivisione: ${(e as Error).message}`)
    } finally {
      setUpdatingShare(false)
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Le tue liste"
        title={STATUS_LABELS[status]}
        subtitle={copy.subtitle}
      >
        {shareable && (
          <button
            onClick={toggleShare}
            disabled={updatingShare}
            className="btn-ghost"
            title={isPublic ? 'Chiunque con il link può vederla' : 'Solo tu puoi vederla'}
          >
            {isPublic ? '🌍 Pubblica' : '🔒 Condividi'}
          </button>
        )}
      </PageHeader>

      {shareable && isPublic && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-projector/30 bg-projector/5 px-4 py-3">
          <span className="text-sm text-zinc-300">🔗 Watchlist condivisibile:</span>
          <code className="flex-1 truncate rounded bg-theatre-950/60 px-2 py-1 text-xs text-projector">
            {shareUrl}
          </code>
          <button onClick={copyShareLink} className="btn-primary px-3 py-1.5 text-sm">
            Copia link
          </button>
        </div>
      )}

      {loading ? (
        <Loader label="Apro la tua collezione…" />
      ) : error ? (
        <ErrorState title="Impossibile caricare la lista" message={error} />
      ) : items.length === 0 ? (
        <EmptyState
          title="Lista ancora vuota"
          message="Apri la scheda di un titolo e assegnagli questo stato per vederlo qui."
          icon={copy.icon}
        />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {items.map((record) => (
            <SavedTitleCard key={record.id} record={record}>
              {status === 'abandoned' && (
                <button onClick={() => resume(record)} className="btn-ghost w-full py-1.5 text-sm">
                  ▶️ Riprendi
                </button>
              )}
            </SavedTitleCard>
          ))}
        </div>
      )}
    </div>
  )
}
