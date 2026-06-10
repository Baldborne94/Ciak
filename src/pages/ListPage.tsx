import PageHeader from '../components/PageHeader'
import { EmptyState } from '../components/States'
import { isSupabaseConfigured } from '../lib/supabase'
import { STATUS_LABELS, type TitleStatus } from '../lib/types'

const COPY: Record<TitleStatus, { eyebrow: string; subtitle: string; icon: string }> = {
  watched: {
    eyebrow: 'Le tue liste',
    subtitle: 'Tutti i titoli che hai già guardato.',
    icon: '✅',
  },
  to_watch: {
    eyebrow: 'Le tue liste',
    subtitle: 'La tua watchlist: cosa guardare alla prossima serata.',
    icon: '🎟️',
  },
  in_progress: {
    eyebrow: 'Le tue liste',
    subtitle: 'Serie e anime che stai seguendo in questo momento.',
    icon: '▶️',
  },
  abandoned: {
    eyebrow: 'Le tue liste',
    subtitle: 'Titoli iniziati ma lasciati a metà.',
    icon: '🚪',
  },
}

export default function ListPage({ status }: { status: TitleStatus }) {
  const copy = COPY[status]

  return (
    <div>
      <PageHeader
        eyebrow={copy.eyebrow}
        title={STATUS_LABELS[status]}
        subtitle={copy.subtitle}
      />

      <EmptyState
        title={
          isSupabaseConfigured
            ? 'Lista ancora vuota'
            : 'Collega Supabase per salvare le liste'
        }
        message={
          isSupabaseConfigured
            ? 'Apri la scheda di un titolo e assegnagli uno stato per vederlo qui. (Salvataggio attivo nella fase liste.)'
            : 'Imposta VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY per abilitare il salvataggio dei tuoi titoli.'
        }
        icon={copy.icon}
      />
    </div>
  )
}
