import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ErrorState, Loader } from '../components/States'
import MediaGrid from '../components/MediaGrid'
import TitleActions from '../components/TitleActions'
import {
  backdropUrl,
  getDetail,
  isTmdbConfigured,
  logoUrl,
  posterUrl,
  profileUrl,
} from '../lib/tmdb'
import type { MediaDetail, TmdbType } from '../lib/types'

const LANG_NAMES: Record<string, string> = {
  en: 'Inglese', it: 'Italiano', ja: 'Giapponese', fr: 'Francese',
  es: 'Spagnolo', de: 'Tedesco', ko: 'Coreano', zh: 'Cinese',
  hi: 'Hindi', ru: 'Russo', pt: 'Portoghese', sv: 'Svedese',
  da: 'Danese', no: 'Norvegese', nl: 'Olandese', tr: 'Turco',
}

const STATUS_NAMES: Record<string, string> = {
  Released: 'Uscito', 'Post Production': 'Post-produzione',
  'In Production': 'In produzione', Planned: 'Pianificato',
  'Returning Series': 'In corso', Ended: 'Conclusa', Canceled: 'Cancellata',
}

function formatMoney(n: number): string {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  }).format(n)
}

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
              {detail.originalTitle || detail.title}
            </h1>
            {detail.originalTitle && detail.title && detail.originalTitle !== detail.title && (
              <p className="mt-1 text-lg text-zinc-400">
                🇮🇹 {detail.title}
              </p>
            )}
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

            {detail.directors.length > 0 && (
              <p className="mt-4 text-sm text-zinc-400">
                <span className="text-zinc-500">
                  {detail.mediaType === 'tv' ? 'Creata da: ' : 'Regia: '}
                </span>
                <span className="text-zinc-200">{detail.directors.join(', ')}</span>
              </p>
            )}

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
                genreIds: detail.genreIds,
              }}
            />
          </div>
        </div>
      </div>

      {/* Technical details */}
      <section>
        <h2 className="mb-4 font-display text-2xl tracking-wide text-zinc-100">
          📋 Scheda tecnica
        </h2>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {detail.title && detail.originalTitle && detail.title !== detail.originalTitle && (
            <Info label="Titolo italiano" value={detail.title} />
          )}
          {detail.originalLanguage && (
            <Info
              label="Lingua originale"
              value={LANG_NAMES[detail.originalLanguage] ?? detail.originalLanguage.toUpperCase()}
            />
          )}
          {detail.status && (
            <Info label="Stato" value={STATUS_NAMES[detail.status] ?? detail.status} />
          )}
          {detail.productionCountries.length > 0 && (
            <Info label="Paese" value={detail.productionCountries.join(', ')} />
          )}
          {detail.numberOfSeasons != null && (
            <Info label="Stagioni" value={String(detail.numberOfSeasons)} />
          )}
          {detail.numberOfEpisodes != null && (
            <Info label="Episodi" value={String(detail.numberOfEpisodes)} />
          )}
          {detail.runtime != null && (
            <Info label="Durata" value={`${detail.runtime} min`} />
          )}
          {detail.budget != null && detail.budget > 0 && (
            <Info label="Budget" value={formatMoney(detail.budget)} />
          )}
          {detail.revenue != null && detail.revenue > 0 && (
            <Info label="Incassi" value={formatMoney(detail.revenue)} />
          )}
        </dl>

        {detail.productionCompanies.length > 0 && (
          <div className="mt-6">
            <p className="mb-3 text-xs uppercase tracking-wider text-zinc-500">
              Studi di produzione
            </p>
            <div className="flex flex-wrap gap-3">
              {detail.productionCompanies.map((c) => {
                const logo = logoUrl(c.logoPath)
                return (
                  <Link
                    key={c.id}
                    to={`/studio/${c.id}`}
                    className="flex items-center gap-2 rounded-lg border border-theatre-700 bg-theatre-900/60 px-3 py-2 text-sm text-zinc-300 transition hover:border-projector/40 hover:text-projector"
                  >
                    {logo ? (
                      <img src={logo} alt={c.name} className="max-h-6 bg-white/90 px-1" />
                    ) : (
                      <span>🏛️</span>
                    )}
                    {c.name}
                  </Link>
                )
              })}
            </div>
          </div>
        )}

        {detail.homepage && (
          <a
            href={detail.homepage}
            target="_blank"
            rel="noreferrer"
            className="mt-6 inline-block text-sm text-projector/80 hover:text-projector"
          >
            🔗 Sito ufficiale
          </a>
        )}
      </section>

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
                <Link
                  to={`/person/${member.id}`}
                  key={member.id}
                  className="group text-center"
                >
                  <div className="aspect-square overflow-hidden rounded-full border border-theatre-700 bg-theatre-800 transition group-hover:border-projector/50">
                    {photo ? (
                      <img
                        src={photo}
                        alt={member.name}
                        loading="lazy"
                        className="h-full w-full object-cover transition group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-2xl opacity-30">
                        👤
                      </div>
                    )}
                  </div>
                  <p className="mt-2 line-clamp-1 text-sm font-medium text-zinc-200 group-hover:text-projector">
                    {member.name}
                  </p>
                  <p className="line-clamp-1 text-xs text-zinc-500">
                    {member.character}
                  </p>
                </Link>
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

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-theatre-800 bg-theatre-900/40 p-3">
      <dt className="text-xs uppercase tracking-wider text-zinc-500">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-zinc-200">{value}</dd>
    </div>
  )
}
