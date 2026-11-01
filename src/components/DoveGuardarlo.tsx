import { useState } from 'react'
import { logoUrl } from '../lib/tmdb'
import type { MediaDetail, Provider } from '../lib/types'

// «Dove guardarlo» nella scheda di un titolo: i servizi del paese scelto
// (l'Italia, se c'è, o il primo), con un link che apre il servizio già sulla
// ricerca del titolo. Era dentro TitleDetail, che deve solo accorciarsi.
export default function DoveGuardarlo({ paesi, titolo }: { paesi: MediaDetail['watchProvidersByCountry']; titolo: string }) {
  const [paese, setPaese] = useState('')
  if (paesi.length === 0) return null
  const selected = paesi.find((c) => c.code === paese) ?? paesi[0]
  const p = selected.providers
  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-2xl tracking-wide text-zinc-100">
          📺 Dove guardarlo{' '}
          <span className="text-sm font-normal text-zinc-500">in {selected.name}</span>
        </h2>
        {paesi.length > 1 && (
          <select
            value={selected.code}
            onChange={(e) => setPaese(e.target.value)}
            className="input-cine w-auto py-1.5 text-sm"
            aria-label="Scegli il paese"
          >
            {paesi.map((c) => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </select>
        )}
      </div>
      <div className="space-y-4">
        <ProvidersGroup label="In abbonamento" items={p.flatrate} link={p.link} title={titolo} />
        <ProvidersGroup label="Noleggio" items={p.rent} link={p.link} title={titolo} />
        <ProvidersGroup label="Acquisto" items={p.buy} link={p.link} title={titolo} />
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
