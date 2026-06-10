import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ErrorState, Loader } from '../components/States'
import MediaGrid from '../components/MediaGrid'
import TitleActions from '../components/TitleActions'
import {
  backdropUrl,
  getDetail,
  isTmdbConfigured,
  posterUrl,
  profileUrl,
} from '../lib/tmdb'
import type { MediaDetail, TmdbType } from '../lib/types'

export default function TitleDetail() {
  const { mediaType, id } = useParams<{ mediaType: TmdbType; id: string }>()
  const [detail, setDetail] = useState<MediaDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!mediaType || !id) return
    if (!isTmdbConfigured) {
      setError('Configura VITE_TMDB_API_KEY per vedere i dettagli del titolo.')
      setLoading(false)
      return
    }
    setLoading(true)
    getDetail(mediaType, Number(id))
      .then(setDetail)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [mediaType, id])

  if (loading) return <Loader label="Carico la scheda…" />
  if (error) return <ErrorState title="Scheda non disponibile" message={error} />
  if (!detail) return null

  const backdrop = backdropUrl(detail.backdropPath)
  const poster = posterUrl(detail.posterPath, 'w500')
  const year = detail.releaseDate ? detail.releaseDate.slice(0, 4) : '—'

  return (
    <div className="space-y-10">
      {/* Hero with backdrop */}
      <div className="relative overflow-hidden rounded-2xl border border-theatre-800">
        {backdrop && (
          <div className="absolute inset-0">
            <img
              src={backdrop}
              alt=""
              className="h-full w-full object-cover opacity-30"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-theatre-950 via-theatre-950/80 to-transparent" />
          </div>
        )}

        <div className="relative flex flex-col gap-6 p-6 sm:flex-row sm:p-8">
          <div className="w-40 flex-shrink-0 sm:w-52">
            {poster ? (
              <img
                src={poster}
                alt={detail.title}
                className="w-full rounded-xl border border-theatre-700 shadow-reel"
              />
            ) : (
              <div className="flex aspect-[2/3] items-center justify-center rounded-xl bg-theatre-800 text-5xl">
                🎞️
              </div>
            )}
          </div>

          <div className="flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-projector/80">
              {detail.mediaType === 'tv' ? 'Serie TV' : 'Film'} · {year}
            </p>
            <h1 className="mt-1 font-display text-4xl tracking-wide text-zinc-100 sm:text-5xl">
              {detail.title}
            </h1>
            {detail.tagline && (
              <p className="mt-2 italic text-zinc-400">«{detail.tagline}»</p>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
              <span className="rounded-md bg-projector/15 px-2 py-1 font-semibold text-projector">
                ★ {detail.voteAverage.toFixed(1)}
              </span>
              {detail.runtime && (
                <span className="text-zinc-400">⏱️ {detail.runtime} min</span>
              )}
              {detail.genres.map((g) => (
                <span
                  key={g.id}
                  className="rounded-md bg-theatre-800 px-2 py-1 text-zinc-300"
                >
                  {g.name}
                </span>
              ))}
            </div>

            <p className="mt-5 max-w-2xl text-zinc-300">
              {detail.overview || 'Nessuna trama disponibile.'}
            </p>

            {/* Personal actions — persisted to Supabase (user_titles). */}
            <TitleActions
              titleRef={{
                tmdbId: detail.id,
                mediaType: detail.mediaType,
                title: detail.title,
                posterPath: detail.posterPath,
              }}
            />
          </div>
        </div>
      </div>

      {/* Cast */}
      {detail.cast.length > 0 && (
        <section>
          <h2 className="mb-4 font-display text-2xl tracking-wide text-zinc-100">
            🎭 Cast principale
          </h2>
          <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6">
            {detail.cast.map((member) => {
              const photo = profileUrl(member.profilePath)
              return (
                <div key={member.id} className="text-center">
                  <div className="aspect-square overflow-hidden rounded-full border border-theatre-700 bg-theatre-800">
                    {photo ? (
                      <img
                        src={photo}
                        alt={member.name}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-2xl opacity-30">
                        👤
                      </div>
                    )}
                  </div>
                  <p className="mt-2 line-clamp-1 text-sm font-medium text-zinc-200">
                    {member.name}
                  </p>
                  <p className="line-clamp-1 text-xs text-zinc-500">
                    {member.character}
                  </p>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Recommendations */}
      {detail.recommendations.length > 0 && (
        <section>
          <h2 className="mb-4 font-display text-2xl tracking-wide text-zinc-100">
            🍿 Se ti è piaciuto, guarda anche
          </h2>
          <MediaGrid items={detail.recommendations} />
        </section>
      )}

      <Link to="/search" className="inline-block text-sm text-projector/80 hover:text-projector">
        ← Torna alla ricerca
      </Link>
    </div>
  )
}
