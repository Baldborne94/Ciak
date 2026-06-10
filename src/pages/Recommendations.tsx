import { useState } from 'react'
import PageHeader from '../components/PageHeader'
import { EmptyState, ErrorState, Loader } from '../components/States'

interface Suggestion {
  title: string
  reason: string
}

export default function Recommendations() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null)

  async function generate() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ favorites: [], watched: [] }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(
          body.error ?? 'Il servizio di raccomandazioni non è ancora attivo.',
        )
      }
      const data = (await res.json()) as { suggestions: Suggestion[] }
      setSuggestions(data.suggestions ?? [])
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Su misura per te"
        title="Raccomandazioni AI"
        subtitle="L'AI analizza i tuoi preferiti e i titoli visti per suggerirti il prossimo film."
      >
        <button onClick={generate} className="btn-primary" disabled={loading}>
          {loading ? '✨ Genero…' : '✨ Genera suggerimenti'}
        </button>
      </PageHeader>

      {loading ? (
        <Loader label="L'AI sta sfogliando la tua cineteca…" />
      ) : error ? (
        <ErrorState title="Raccomandazioni non disponibili" message={error} icon="🤖" />
      ) : suggestions === null ? (
        <EmptyState
          title="Pronto quando lo sei"
          message="Premi «Genera suggerimenti»: l'AI individua i tuoi gusti (generi, registi, temi) e ti propone titoli con una spiegazione personalizzata."
          icon="🪄"
        />
      ) : suggestions.length === 0 ? (
        <EmptyState
          title="Servono più dati"
          message="Aggiungi qualche titolo ai preferiti e ai visti, poi rigenera i suggerimenti."
        />
      ) : (
        <div className="space-y-4">
          {suggestions.map((s, i) => (
            <div
              key={i}
              className="rounded-xl border border-theatre-800 bg-theatre-900/60 p-5"
            >
              <h3 className="font-display text-xl tracking-wide text-projector">
                {s.title}
              </h3>
              <p className="mt-2 text-sm text-zinc-300">{s.reason}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
