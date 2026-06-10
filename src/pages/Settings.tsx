import PageHeader from '@/components/PageHeader'

export default function Settings() {
  return (
    <div>
      <PageHeader
        eyebrow="Regia personale"
        title="Impostazioni"
        subtitle="Calibra l'esperienza: generi preferiti, generi da escludere dai suggerimenti e lingue."
      />

      <div className="grid gap-6 md:grid-cols-2">
        <div className="panel p-6">
          <h2 className="title-display mb-1 text-xl text-gold">Account</h2>
          <p className="text-sm text-zinc-500">
            Login con email o Google via Supabase Auth — in arrivo. Per ora l'app gira in
            modalità anonima.
          </p>
        </div>

        <div className="panel p-6">
          <h2 className="title-display mb-1 text-xl text-gold">Preferenze AI</h2>
          <p className="text-sm text-zinc-500">
            Generi preferiti, generi esclusi e lingue. Salvati su Supabase nella tabella
            <code className="mx-1 rounded bg-cinema-black px-1 text-gold/80">user_preferences</code>
            (Fase 7).
          </p>
        </div>

        <div className="panel p-6">
          <h2 className="title-display mb-1 text-xl text-gold">Lingua del catalogo</h2>
          <p className="text-sm text-zinc-500">
            Italiano / Inglese per titoli e trame. Attualmente impostata su Italiano (it-IT).
          </p>
        </div>

        <div className="panel p-6">
          <h2 className="title-display mb-1 text-xl text-gold">Tema</h2>
          <p className="text-sm text-zinc-500">
            Sala buia, accenti oro proiettore e rosso sipario. 🎬 (l'unico tema che un vero
            cinefilo possa volere)
          </p>
        </div>
      </div>
    </div>
  )
}
