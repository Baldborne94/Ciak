import PageHeader from '../components/PageHeader'
import { EmptyState } from '../components/States'
import { isSupabaseConfigured } from '../lib/supabase'

export default function Favorites() {
  return (
    <div>
      <PageHeader
        eyebrow="La tua collezione"
        title="Preferiti"
        subtitle="I titoli che ami, con voto personale (1–5 ⭐) e note."
      />

      <EmptyState
        title={
          isSupabaseConfigured
            ? 'Nessun preferito, per ora'
            : 'Collega Supabase per i preferiti'
        }
        message={
          isSupabaseConfigured
            ? 'Segna un titolo come preferito dalla sua scheda. Qui potrai votarlo e annotare i tuoi commenti. (Attivo nella fase preferiti.)'
            : 'Imposta le credenziali Supabase nel file .env per salvare i tuoi preferiti.'
        }
        icon="❤️"
      />
    </div>
  )
}
