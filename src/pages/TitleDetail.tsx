import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getTitleDetail, IMG } from '@/lib/tmdb'
import TitleGrid from '@/components/TitleGrid'
import Spinner from '@/components/Spinner'
import EmptyState from '@/components/EmptyState'

export default function TitleDetail() {
  const { type, id } = useParams<{ type: string; id: string }>()
  const mediaType = type === 'tv' ? 'tv' : 'movie'
  const tmdbId = Number(id)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['title', mediaType, tmdbId],
    queryFn: () => getTitleDetail(mediaType, tmdbId),
    enabled: Number.isFinite(tmdbId),
  })

  if (isLoading) return <Spinner label="Apro la scheda…" />
  if (isError || !data)
    return (
      <EmptyState
        icon="🎬"
        title="Scheda non disponibile"
        message={error instanceof Error ? error.message : 'Titolo non trovato.'}
      >
        <Link to="/search" className="btn-ghost mt-2">
          ← Torna alla ricerca
        </Link>
      </EmptyState>
    )

  const backdrop = IMG.backdrop(data.backdrop_path)
  const poster = IMG.poster(data.poster_path, 'w500')
  const year = data.release_date?.slice(0, 4)

  return (
    <div className="-mx-4 -mt-8">
      {/* Backdrop cinematografico */}
      <div className="relative h-[42vh] min-h-[260px] w-full overflow-hidden">
        {backdrop ? (
          <img src={backdrop} alt="" className="h-full w-full object-cover object-top" />
        ) : (
          <div className="h-full w-full bg-cinema-dark" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-cinema-black via-cinema-black/70 to-transparent" />
      </div>

      <div className="mx-auto -mt-40 max-w-7xl px-4">
        <div className="flex flex-col gap-8 md:flex-row">
          {/* Locandina */}
          <div className="mx-auto w-48 shrink-0 sm:w-56 md:mx-0">
            <div className="overflow-hidden rounded-xl border border-cinema-border shadow-poster">
              {poster ? (
                <img src={poster} alt={data.title} className="w-full" />
              ) : (
                <div className="flex aspect-[2/3] items-center justify-center bg-cinema-panel text-5xl">
                  🎞️
                </div>
              )}
            </div>
          </div>

          {/* Info principali */}
          <div className="flex-1 pt-2 md:pt-32">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded bg-gold/15 px-2 py-0.5 font-semibold uppercase tracking-wide text-gold">
                {mediaType === 'tv' ? 'Serie TV' : 'Film'}
              </span>
              {data.vote_average > 0 && (
                <span className="rounded bg-cinema-panel px-2 py-0.5 font-bold text-gold">
                  ★ {data.vote_average.toFixed(1)}
                </span>
              )}
            </div>

            <h1 className="title-display text-4xl text-white sm:text-5xl">
              {data.title} {year && <span className="text-zinc-500">({year})</span>}
            </h1>
            {data.tagline && (
              <p className="mt-1 text-sm italic text-gold/70">«{data.tagline}»</p>
            )}

            {/* Meta */}
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-400">
              {data.genres.length > 0 && (
                <span>{data.genres.map((g) => g.name).join(' · ')}</span>
              )}
              {data.runtime ? <span>⏱️ {data.runtime} min</span> : null}
              {data.number_of_seasons ? (
                <span>
                  📺 {data.number_of_seasons} stagioni · {data.number_of_episodes} episodi
                </span>
              ) : null}
            </div>

            {/* Azioni liste personali — collegamento a Supabase nella Fase 3 */}
            <div className="mt-6 flex flex-wrap gap-2">
              <button className="btn-gold" title="Disponibile dopo l'integrazione liste (Fase 3)">
                + Aggiungi alla lista
              </button>
              <button className="btn-ghost" title="Disponibile dopo l'integrazione preferiti (Fase 4)">
                ☆ Preferito
              </button>
            </div>

            {/* Trama */}
            <h2 className="title-display mt-8 text-xl text-white">Trama</h2>
            <p className="mt-2 max-w-3xl leading-relaxed text-zinc-300">
              {data.overview || 'Trama non disponibile in italiano per questo titolo.'}
            </p>
          </div>
        </div>

        {/* Cast */}
        {data.cast.length > 0 && (
          <section className="mt-12">
            <h2 className="title-display mb-4 text-2xl text-white">Cast principale</h2>
            <div className="flex gap-4 overflow-x-auto pb-3">
              {data.cast.map((actor) => {
                const profile = IMG.profile(actor.profile_path)
                return (
                  <div key={actor.id} className="w-28 shrink-0 text-center">
                    <div className="mb-2 aspect-[2/3] overflow-hidden rounded-lg border border-cinema-border bg-cinema-panel">
                      {profile ? (
                        <img src={profile} alt={actor.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-2xl text-zinc-700">
                          👤
                        </div>
                      )}
                    </div>
                    <div className="text-xs font-semibold text-zinc-200">{actor.name}</div>
                    <div className="text-[11px] text-zinc-500">{actor.character}</div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* Raccomandazioni TMDB */}
        {data.recommendations.length > 0 && (
          <section className="mt-12 pb-8">
            <h2 className="title-display mb-4 text-2xl text-white">Se ti è piaciuto…</h2>
            <TitleGrid titles={data.recommendations} />
          </section>
        )}
      </div>
    </div>
  )
}
