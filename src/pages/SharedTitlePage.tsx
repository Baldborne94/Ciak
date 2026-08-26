import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import { ErrorState, Loader } from '../components/States'
import { useAuth } from '../lib/auth'
import { useLibrary } from '../lib/libraryCtx'
import { useToast } from '../lib/toastCtx'
import { getDetail, posterUrl } from '../lib/tmdb'
import { getUserTitle, upsertUserTitle } from '../lib/userTitles'
import type { MediaDetail, TitleStatus, TmdbType } from '../lib/types'

const STATUS_LABEL: Record<TitleStatus, string> = {
  to_watch: 'Da vedere',
  watched: 'Visto',
  in_progress: 'In corso',
  abandoned: 'Abbandonato',
}

// Atterraggio di un consiglio ricevuto: mostra il titolo e lo aggiunge alla
// watchlist con un click. La pagina è pubblica perché il link gira fuori
// dall'app (WhatsApp, messaggi): chi non ha ancora fatto login vede comunque
// di cosa si tratta, e dopo l'accesso torna qui invece che in home.
export default function SharedTitlePage() {
  const { mediaType, id } = useParams<{ mediaType: string; id: string }>()
  const { user } = useAuth()
  const { refresh } = useLibrary()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const location = useLocation()

  const [detail, setDetail] = useState<MediaDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [current, setCurrent] = useState<TitleStatus | null>(null)
  const [saving, setSaving] = useState(false)
  const [added, setAdded] = useState(false)

  // TMDB accetta solo movie/tv: un tipo diverso nell'URL è un link rotto.
  const type: TmdbType | null = mediaType === 'movie' || mediaType === 'tv' ? mediaType : null
  const tmdbId = Number(id)

  useEffect(() => {
    if (!type || !Number.isFinite(tmdbId)) {
      setError('Il link non è valido: manca il film o la serie da consigliare.')
      setLoading(false)
      return
    }
    setLoading(true)
    getDetail(type, tmdbId)
      .then(setDetail)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [type, tmdbId])

  // Se il titolo è già in collezione lo diciamo subito, invece di far scoprire
  // il doppione solo dopo aver premuto "aggiungi".
  useEffect(() => {
    if (!user || !type || !Number.isFinite(tmdbId)) return
    getUserTitle(user.id, tmdbId, type)
      .then((row) => setCurrent((row?.status as TitleStatus | undefined) ?? null))
      .catch(() => setCurrent(null))
  }, [user, type, tmdbId])

  async function addToWatchlist() {
    if (!user || !detail || !type) return
    setSaving(true)
    try {
      await upsertUserTitle(
        user.id,
        {
          tmdbId: detail.id,
          mediaType: type,
          title: detail.title,
          posterPath: detail.posterPath,
          genreIds: detail.genreIds,
        },
        { status: 'to_watch' },
      )
      setCurrent('to_watch')
      setAdded(true)
      refresh()
      showToast('Aggiunto ai titoli da vedere!', 'success')
    } catch (e) {
      showToast((e as Error).message, 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Loader label="Apro il consiglio…" />
  if (error || !detail || !type) {
    return <ErrorState title="Consiglio non disponibile" message={error ?? 'Titolo non trovato.'} />
  }

  const poster = posterUrl(detail.posterPath)
  const year = detail.releaseDate ? detail.releaseDate.slice(0, 4) : ''

  return (
    <div>
      <PageHeader
        eyebrow="Ti hanno consigliato"
        title={detail.title}
        subtitle={year ? `${year} · aggiungilo alla tua lista con un click` : 'Aggiungilo alla tua lista con un click'}
      />

      <div className="flex flex-col gap-6 sm:flex-row">
        <div className="w-40 shrink-0 overflow-hidden rounded-xl border border-theatre-800 bg-theatre-800">
          {poster ? (
            <img src={poster} alt={detail.title} className="h-full w-full object-cover" />
          ) : (
            <div className="flex aspect-[2/3] w-full items-center justify-center text-4xl opacity-30">
              🎞️
            </div>
          )}
        </div>

        <div className="flex-1">
          <p className="max-w-2xl text-zinc-300">
            {detail.overview || 'Nessuna trama disponibile.'}
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            {!user ? (
              <>
                <button
                  className="btn-primary"
                  onClick={() =>
                    navigate('/login', { state: { from: location.pathname }, replace: false })
                  }
                >
                  Accedi per aggiungerlo
                </button>
                <span className="text-sm text-zinc-400">
                  Dopo l'accesso torni qui e lo salvi.
                </span>
              </>
            ) : added || current === 'to_watch' ? (
              <>
                <span className="rounded-lg bg-emerald-900/40 px-3 py-2 text-sm text-emerald-300">
                  ✓ È nella tua lista «Da vedere»
                </span>
                <Link to="/lists/watchlist" className="btn-ghost">
                  Vai alla lista
                </Link>
              </>
            ) : current ? (
              <>
                <span className="rounded-lg bg-theatre-800 px-3 py-2 text-sm text-zinc-300">
                  Ce l'hai già in collezione: {STATUS_LABEL[current]}
                </span>
                <Link to={`/title/${type}/${detail.id}`} className="btn-ghost">
                  Apri la scheda
                </Link>
              </>
            ) : (
              <>
                <button className="btn-primary" onClick={addToWatchlist} disabled={saving}>
                  {saving ? 'Aggiungo…' : '➕ Aggiungi a «Da vedere»'}
                </button>
                <Link to={`/title/${type}/${detail.id}`} className="btn-ghost">
                  Apri la scheda
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
