import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ErrorState, Loader } from '../components/States'
import MediaGrid from '../components/MediaGrid'
import TitleActions from '../components/TitleActions'
import AddToListButton from '../components/AddToListButton'
import LogDiaryButton from '../components/LogDiaryButton'
import ShareTitleButton from '../components/ShareTitleButton'
import SeasonsSection from '../components/SeasonsSection'
import {
  backdropUrl,
  displayTitle,
  getDetail,
  logoUrl,
  posterUrl,
  profileUrl,
} from '../lib/tmdb'
import { useAuth } from '../lib/auth'
import { useToast } from '../lib/toastCtx'
import { logFailure } from '../lib/logFailure'
import { parseYoutubeKey } from '../lib/youtubeKey'
import {
  clearCustomTrailer,
  getCustomTrailer,
  setCustomTrailer as setCustomTrailerDb,
} from '../lib/customTrailers'
import type { MediaDetail, Provider, TmdbType } from '../lib/types'

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
  const { user } = useAuth()
  const { showToast } = useToast()
  const [detail, setDetail] = useState<MediaDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showTrailer, setShowTrailer] = useState(false)
  // Trailer scelto dall'utente: vince su quello di TMDB, che a volte è sbagliato
  // (i video del catalogo sono contributi aperti) o manca del tutto.
  const [customTrailer, setCustomTrailer] = useState<string | null>(null)
  const [editingTrailer, setEditingTrailer] = useState(false)
  const [trailerInput, setTrailerInput] = useState('')
  const [savingTrailer, setSavingTrailer] = useState(false)
  // Selected country for "Dove guardarlo" ('' = default to first, i.e. Italy).
  const [watchCountry, setWatchCountry] = useState('')
  // Sort for the "Se ti è piaciuto, guarda anche" list.
  const [recSort, setRecSort] = useState<'default' | 'date_desc' | 'date_asc' | 'rating_desc'>('default')

  // Reset per-title UI state when navigating to a different title. showTrailer
  // compreso: senza, passando da una scheda col trailer aperto a un'altra la
  // nuova partiva col riquadro già aperto.
  useEffect(() => {
    setWatchCountry('')
    setRecSort('default')
    setShowTrailer(false)
    setEditingTrailer(false)
    setCustomTrailer(null)
  }, [mediaType, id])

  // Il trailer scelto dall'utente per questo titolo, se ce n'è uno.
  useEffect(() => {
    if (!user || !mediaType || !id) return
    let annullata = false
    getCustomTrailer(user.id, Number(id), mediaType)
      .then((k) => { if (!annullata) setCustomTrailer(k) })
      .catch(logFailure('trailer personalizzato non caricato'))
    return () => { annullata = true }
  }, [user, mediaType, id])

  // Recommendations sorted by the chosen order ('default' keeps our relevance rank).
  const sortedRecs = useMemo(() => {
    const recs = detail?.recommendations ?? []
    if (recSort === 'date_desc') {
      return [...recs].sort((a, b) => (b.releaseDate ?? '').localeCompare(a.releaseDate ?? ''))
    }
    if (recSort === 'date_asc') {
      return [...recs].sort((a, b) => (a.releaseDate || '9999').localeCompare(b.releaseDate || '9999'))
    }
    if (recSort === 'rating_desc') {
      return [...recs].sort((a, b) => b.voteAverage - a.voteAverage)
    }
    return recs
  }, [detail, recSort])

  useEffect(() => {
    if (!mediaType || !id) return
    setLoading(true)
    // Guardia contro le risposte fuori ordine: passando in fretta da una scheda
    // all'altra, la richiesta più vecchia può arrivare per ultima e sovrascrive
    // la pagina col titolo sbagliato. Senza questo, ciò che vedi dipende da
    // quale risposta è arrivata dopo.
    let annullata = false
    getDetail(mediaType, Number(id))
      .then((d) => { if (!annullata) setDetail(d) })
      .catch((e: Error) => { if (!annullata) setError(e.message) })
      .finally(() => { if (!annullata) setLoading(false) })
    return () => { annullata = true }
  }, [mediaType, id])


  async function salvaTrailer() {
    if (!user || !mediaType || !id) return
    const key = parseYoutubeKey(trailerInput)
    if (!key) {
      showToast('Non riconosco questo link YouTube. Incolla l\'indirizzo del video.', 'error')
      return
    }
    setSavingTrailer(true)
    try {
      await setCustomTrailerDb(user.id, Number(id), mediaType, key)
      setCustomTrailer(key)
      setEditingTrailer(false)
      setTrailerInput('')
      setShowTrailer(false)
      showToast('Trailer aggiornato.', 'success')
    } catch (e) {
      showToast(`Non sono riuscito a salvarlo: ${(e as Error).message}`, 'error')
    } finally {
      setSavingTrailer(false)
    }
  }

  async function ripristinaTrailer() {
    if (!user || !mediaType || !id) return
    try {
      await clearCustomTrailer(user.id, Number(id), mediaType)
      setCustomTrailer(null)
      setShowTrailer(false)
    } catch (e) {
      showToast(`Non sono riuscito a ripristinarlo: ${(e as Error).message}`, 'error')
    }
  }

  if (loading) return <Loader label="Carico la scheda…" />
  if (error) return <ErrorState title="Scheda non disponibile" message={error} />
  if (!detail) return null

  // Il tuo trailer vince su quello di TMDB.
  const trailerKey = customTrailer ?? detail.trailerKey
  const backdrop = backdropUrl(detail.backdropPath)
  const poster = posterUrl(detail.posterPath, 'w500')
  const year = detail.releaseDate ? detail.releaseDate.slice(0, 4) : '—'

  return (
    <div className="space-y-10">
      {/* Hero with backdrop — no overflow-hidden here so the action menus can
          escape; the backdrop image is clipped by its own wrapper instead. */}
      <div className="relative rounded-2xl border border-theatre-800">
        {backdrop && (
          <div className="absolute inset-0 overflow-hidden rounded-2xl">
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
              {displayTitle(detail)}
            </h1>
            {detail.title && detail.title !== displayTitle(detail) && (
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
                {detail.directors.map((d, i) => (
                  <span key={d.id}>
                    {i > 0 && <span className="text-zinc-500">, </span>}
                    <Link
                      to={`/person/${d.id}`}
                      className="text-zinc-200 hover:text-projector transition-colors"
                    >
                      {d.name}
                    </Link>
                  </span>
                ))}
              </p>
            )}

            {/* Raccolta/saga: chiarisce quando un titolo è parte di un insieme
                (es. Planet Terror / Death Proof dentro Grindhouse). */}
            {detail.collection && (
              <Link
                to={`/collection/${detail.collection.id}`}
                className="mt-3 inline-flex items-center gap-2 rounded-lg border border-projector/30 bg-projector/5 px-3 py-1.5 text-sm text-projector transition hover:bg-projector/10"
              >
                🎬 Fa parte di: <span className="font-semibold">{detail.collection.name}</span> →
              </Link>
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
            <div className="mt-3 flex flex-wrap gap-2">
              <AddToListButton
                item={{
                  tmdbId: detail.id,
                  mediaType: detail.mediaType,
                  title: detail.title,
                  posterPath: detail.posterPath,
                }}
              />
              <LogDiaryButton
                item={{
                  tmdbId: detail.id,
                  mediaType: detail.mediaType,
                  title: detail.title,
                  posterPath: detail.posterPath,
                }}
              />
              <ShareTitleButton
                tmdbId={detail.id}
                mediaType={detail.mediaType}
                title={detail.title}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Where to watch — country picker (Italy + abroad) */}
      {detail.watchProvidersByCountry.length > 0 && (() => {
        const countries = detail.watchProvidersByCountry
        const selected =
          countries.find((c) => c.code === watchCountry) ?? countries[0]
        const p = selected.providers
        return (
          <section>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-2xl tracking-wide text-zinc-100">
                📺 Dove guardarlo{' '}
                <span className="text-sm font-normal text-zinc-500">in {selected.name}</span>
              </h2>
              {countries.length > 1 && (
                <select
                  value={selected.code}
                  onChange={(e) => setWatchCountry(e.target.value)}
                  className="input-cine w-auto py-1.5 text-sm"
                  aria-label="Scegli il paese"
                >
                  {countries.map((c) => (
                    <option key={c.code} value={c.code}>{c.name}</option>
                  ))}
                </select>
              )}
            </div>
            <div className="space-y-4">
              <ProvidersGroup label="In abbonamento" items={p.flatrate} link={p.link} title={detail.title} />
              <ProvidersGroup label="Noleggio" items={p.rent} link={p.link} title={detail.title} />
              <ProvidersGroup label="Acquisto" items={p.buy} link={p.link} title={detail.title} />
            </div>
            {p.link && (
              <a
                href={p.link}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-block text-sm text-projector/80 hover:text-projector"
              >
                Dettagli e link su JustWatch →
              </a>
            )}
          </section>
        )
      })()}

      {/* Trailer — quello scelto da te vince su quello di TMDB. La sezione
          compare anche se TMDB non ne ha nessuno: così puoi metterlo tu. */}
      {(trailerKey || user) && (
        <section>
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-2xl tracking-wide text-zinc-100">
              🎬 Trailer
              {customTrailer && (
                <span className="ml-2 align-middle text-xs font-normal text-projector">
                  scelto da te
                </span>
              )}
            </h2>
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <a
                href={`https://www.youtube.com/results?search_query=${encodeURIComponent(`${detail.title} trailer italiano`)}`}
                target="_blank"
                rel="noreferrer"
                className="text-zinc-500 hover:text-projector"
              >
                Cercalo su YouTube →
              </a>
              {user && (
                <button
                  onClick={() => {
                    setTrailerInput('')
                    setEditingTrailer((v) => !v)
                  }}
                  className="text-zinc-500 hover:text-projector"
                >
                  {trailerKey ? '✏️ Non è quello giusto?' : '➕ Aggiungi il trailer'}
                </button>
              )}
              {customTrailer && (
                <button onClick={ripristinaTrailer} className="text-zinc-500 hover:text-projector">
                  ↩️ Usa quello di TMDB
                </button>
              )}
            </div>
          </div>

          {editingTrailer && (
            <div className="mb-4 rounded-xl border border-theatre-700 bg-theatre-900/60 p-4">
              <label htmlFor="trailer-url" className="text-xs uppercase tracking-wider text-zinc-500">
                Link del video YouTube
              </label>
              <div className="mt-1 flex flex-wrap gap-2">
                <input
                  id="trailer-url"
                  value={trailerInput}
                  onChange={(e) => setTrailerInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && salvaTrailer()}
                  placeholder="https://www.youtube.com/watch?v=…"
                  className="input-cine flex-1"
                />
                <button onClick={salvaTrailer} disabled={savingTrailer} className="btn-primary">
                  {savingTrailer ? 'Salvo…' : 'Salva'}
                </button>
                <button onClick={() => setEditingTrailer(false)} className="btn-ghost">
                  Annulla
                </button>
              </div>
              <p className="mt-2 text-xs text-zinc-600">
                Vale solo per te, e sostituisce il video che arriva da TMDB.
              </p>
            </div>
          )}
          {!trailerKey ? (
            <p className="text-sm text-zinc-500">
              Nessun trailer disponibile per questo titolo. Se lo trovi su YouTube, puoi
              aggiungerlo qui sopra.
            </p>
          ) : showTrailer ? (
            <div className="aspect-video w-full overflow-hidden rounded-xl border border-theatre-800">
              <iframe
                src={`https://www.youtube.com/embed/${trailerKey}?autoplay=1`}
                title="Trailer"
                className="h-full w-full"
                allow="autoplay; encrypted-media; fullscreen"
                allowFullScreen
              />
            </div>
          ) : (
            <button
              onClick={() => setShowTrailer(true)}
              className="group relative block aspect-video w-full overflow-hidden rounded-xl border border-theatre-800"
            >
              <img
                src={`https://img.youtube.com/vi/${trailerKey}/hqdefault.jpg`}
                alt="Trailer"
                className="h-full w-full object-cover opacity-70 transition group-hover:opacity-90"
              />
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-curtain/90 text-2xl text-white shadow-reel transition group-hover:scale-110">
                  ▶
                </span>
              </span>
            </button>
          )}
        </section>
      )}

      {/* Technical details */}
      <section>
        <h2 className="mb-4 font-display text-2xl tracking-wide text-zinc-100">
          📋 Scheda tecnica
        </h2>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {detail.originalTitle && detail.originalTitle !== displayTitle(detail) && (
            <Info label="Titolo originale" value={detail.originalTitle} />
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

      {/* Seasons & episodes (TV only) */}
      {detail.mediaType === 'tv' && detail.seasons.length > 0 && (
        <SeasonsSection
          tvId={detail.id}
          seasons={detail.seasons}
          series={{
            tmdbId: detail.id,
            title: displayTitle(detail),
            posterPath: detail.posterPath,
            genreIds: detail.genreIds,
          }}
        />
      )}

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
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-2xl tracking-wide text-zinc-100">
              🍿 Se ti è piaciuto, guarda anche
            </h2>
            <select
              value={recSort}
              onChange={(e) => setRecSort(e.target.value as typeof recSort)}
              className="input-cine w-auto py-1.5 text-sm"
              aria-label="Ordina i consigliati"
            >
              <option value="default">Ordina: pertinenza</option>
              <option value="date_desc">Più recenti</option>
              <option value="date_asc">Meno recenti</option>
              <option value="rating_desc">Voto più alto</option>
            </select>
          </div>
          <MediaGrid items={sortedRecs} />
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

// Known streaming services → a URL that opens the service (app on mobile via
// universal links, site on desktop) with the title pre-searched. TMDB has no
// per-title deep link, so a search inside the service is the closest we can get;
// unknown services fall back to the JustWatch page. Matched by provider name.
function serviceSearchUrl(providerName: string, query: string): string | null {
  const n = providerName.toLowerCase()
  const q = encodeURIComponent(query)
  // Global / US
  if (n.includes('netflix')) return `https://www.netflix.com/search?q=${q}`
  if (n.includes('disney')) return `https://www.disneyplus.com/search?q=${q}`
  if (n.includes('prime video') || n.includes('amazon')) return `https://www.primevideo.com/search/ref=atv_nb_sr?phrase=${q}`
  if (n.includes('apple')) return `https://tv.apple.com/search?term=${q}`
  if (n.includes('paramount')) return `https://www.paramountplus.com/search/?q=${q}`
  if (n.includes('crunchyroll')) return `https://www.crunchyroll.com/search?q=${q}`
  if (n.includes('max') || n.includes('hbo')) return `https://play.max.com/search?q=${q}`
  if (n.includes('hulu')) return `https://www.hulu.com/search?q=${q}`
  if (n.includes('peacock')) return `https://www.peacocktv.com/search?q=${q}`
  if (n.includes('shudder')) return `https://www.shudder.com/search?q=${q}`
  if (n.includes('mubi')) return `https://mubi.com/en/search/films?query=${q}`
  if (n.includes('tubi')) return `https://tubitv.com/search/${q}`
  if (n.includes('pluto')) return `https://pluto.tv/en/search/details?query=${q}`
  if (n.includes('plex')) return `https://watch.plex.tv/search?query=${q}`
  if (n.includes('youtube')) return `https://www.youtube.com/results?search_query=${q}`
  // Italia
  if (n.includes('rai')) return `https://www.raiplay.it/ricerca.html?q=${q}`
  // Everything else (Shudder-like niche or login-gated services without a stable
  // public search URL) falls back to the JustWatch page for the title.
  return null
}

function ProvidersGroup({
  label,
  items,
  link,
  title,
}: {
  label: string
  items: Provider[]
  link?: string | null
  title?: string
}) {
  if (items.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="w-28 text-xs uppercase tracking-wider text-zinc-500">{label}</span>
      {items.map((p) => {
        const logo = logoUrl(p.logoPath)
        const inner = logo ? (
          <img
            src={logo}
            alt={p.name}
            title={p.name}
            className="h-10 w-10 rounded-lg border border-theatre-700 object-cover"
          />
        ) : (
          <span className="rounded-lg bg-theatre-800 px-2 py-1 text-xs text-zinc-300">
            {p.name}
          </span>
        )
        // Prefer opening the service directly (title pre-searched); otherwise
        // fall back to the JustWatch page for the title/country.
        const href = (title && serviceSearchUrl(p.name, title)) || link
        return href ? (
          <a
            key={p.id}
            href={href}
            target="_blank"
            rel="noreferrer"
            title={`Guarda su ${p.name} →`}
            className="transition hover:-translate-y-0.5 hover:opacity-90"
          >
            {inner}
          </a>
        ) : (
          <div key={p.id}>{inner}</div>
        )
      })}
    </div>
  )
}
