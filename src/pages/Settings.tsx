import PageHeader from '../components/PageHeader'
import { isSupabaseConfigured } from '../lib/supabase'
import { isTmdbConfigured } from '../lib/tmdb'

function StatusRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-theatre-800 py-3 last:border-0">
      <span className="text-sm text-zinc-300">{label}</span>
      <span
        className={`rounded-md px-2 py-1 text-xs font-semibold ${
          ok
            ? 'bg-green-500/15 text-green-400'
            : 'bg-curtain/20 text-curtain-light'
        }`}
      >
        {ok ? 'Connesso' : 'Non configurato'}
      </span>
    </div>
  )
}

export default function Settings() {
  return (
    <div>
      <PageHeader
        eyebrow="Il tuo profilo"
        title="Impostazioni"
        subtitle="Preferenze di raccomandazione e stato delle integrazioni."
      />

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-xl border border-theatre-800 bg-theatre-900/60 p-5">
          <h2 className="mb-3 font-display text-xl tracking-wide text-zinc-100">
            🔌 Integrazioni
          </h2>
          <StatusRow label="TMDB (catalogo)" ok={isTmdbConfigured} />
          <StatusRow label="Supabase (dati personali)" ok={isSupabaseConfigured} />
          <p className="mt-3 text-xs text-zinc-500">
            Imposta le chiavi nel file <code className="text-projector/80">.env</code>{' '}
            (vedi <code className="text-projector/80">.env.example</code>).
          </p>
        </section>

        <section className="rounded-xl border border-theatre-800 bg-theatre-900/60 p-5">
          <h2 className="mb-3 font-display text-xl tracking-wide text-zinc-100">
            🎯 Preferenze AI
          </h2>
          <p className="text-sm text-zinc-400">
            Generi preferiti, generi da escludere e lingue: queste preferenze
            calibrano i suggerimenti dell'AI.
          </p>
          <p className="mt-3 text-xs text-zinc-500">
            Disponibili nella fase «preferenze utente», salvate nella tabella{' '}
            <code className="text-projector/80">user_preferences</code> su Supabase.
          </p>
        </section>
      </div>
    </div>
  )
}
