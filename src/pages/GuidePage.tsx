import { Link } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import { useAuth } from '../lib/auth'

// Tutorial + riferimento di tutti gli strumenti di Ciak. Pensata sia per chi
// apre l'app la prima volta sia per chi vuole rinfrescarsi su cosa c'è.
// Accessibile anche da ospite (niente login richiesto).

interface Tool {
  icon: string
  title: string
  body: string
  to?: string
  cta?: string
}

interface Section {
  heading: string
  intro?: string
  tools: Tool[]
}

const SECTIONS: Section[] = [
  {
    heading: '🚀 Per cominciare',
    intro: 'Tre passi e sei operativo.',
    tools: [
      {
        icon: '🎟️',
        title: '1. Accedi',
        body: 'Crea un account con email e password (o Google). Serve per salvare liste, preferiti, diario e per i suggerimenti AI: i tuoi dati restano legati al tuo profilo su qualsiasi dispositivo.',
        to: '/login',
        cta: 'Vai al login',
      },
      {
        icon: '🔍',
        title: '2. Trova qualcosa',
        body: 'Usa «Cerca» per cercare film, serie, anime, cartoni, persone, studi e saghe. A campo vuoto trovi le proposte di tendenza e puoi sfogliare per genere.',
        to: '/search',
        cta: 'Apri Cerca',
      },
      {
        icon: '🏷️',
        title: '3. Segna i titoli',
        body: 'Apri la scheda di un titolo e assegnagli uno stato: Da vedere, In corso, Visto o Abbandonato. Aggiungilo ai preferiti o a una lista. Da qui parte tutto il resto.',
      },
    ],
  },
  {
    heading: '🔍 Cerca & Esplora',
    tools: [
      {
        icon: '🎬',
        title: 'Catalogo bilingue',
        body: 'Ricerca in italiano e inglese insieme. Filtri per Tipo (Film · Serie · ⛩️ Anime · 🎨 Cartoni) e voto minimo. I titoli stranieri restano leggibili (IT/EN).',
        to: '/search',
        cta: 'Cerca titoli',
      },
      {
        icon: '🧑‍🎤',
        title: 'Persone, Studi e Saghe',
        body: 'Cerca attori, registi, compositori e sceneggiatori; studi di produzione; collezioni e franchise. Da una persona o uno studio ritrovi al volo la filmografia.',
      },
      {
        icon: '🎞️',
        title: 'Scheda titolo',
        body: 'Trama, generi, voto, dove guardarlo in streaming (Italia), trailer, cast e crew cliccabili, scheda tecnica e raccomandazioni TMDB.',
      },
    ],
  },
  {
    heading: '📋 Le tue liste',
    tools: [
      {
        icon: '🎟️',
        title: 'Da vedere · In corso',
        body: 'Le liste fisse alimentate dagli stati dei titoli. «Da vedere» è la tua watchlist; «In corso» le serie che stai seguendo. La watchlist puoi anche condividerla con un link pubblico.',
        to: '/lists/watchlist',
        cta: 'Apri «Da vedere»',
      },
      {
        icon: '🗂️',
        title: 'Liste personali tematiche',
        body: 'Crea liste a tema ("Neo-noir", "Da vedere con lei"…) con «Aggiungi a lista» dalla scheda. Puoi renderle pubbliche e condividerle con un link.',
        to: '/liste',
        cta: 'Le mie liste',
      },
      {
        icon: '❤️',
        title: 'Preferiti',
        body: 'Titoli preferiti con voto a mezza stella (0.5–5.0 ★) e note, più persone e studi del cuore.',
        to: '/favorites',
        cta: 'Apri Preferiti',
      },
    ],
  },
  {
    heading: '📖 Diario & progressi',
    tools: [
      {
        icon: '📖',
        title: 'Diario di visione',
        body: 'Registra cosa guardi e quando, con voto e recensione. Supporta le rivisioni (stesso film più volte) e filtri/ricerca per testo, anno e voto minimo.',
        to: '/diario',
        cta: 'Apri il Diario',
      },
      {
        icon: '📺',
        title: 'Stagioni ed episodi',
        body: 'Sulle serie segni i singoli episodi (o stagioni intere). La serie passa automaticamente a «In corso» e a «Vista» quando la completi. In home trovi «Riprendi a guardare» col prossimo episodio.',
      },
      {
        icon: '📊',
        title: 'Statistiche',
        body: 'Il ritratto dei tuoi gusti: ore di film, generi preferiti, registi e attori più visti, distribuzione per decennio e «il tuo anno in film».',
        to: '/statistiche',
        cta: 'Vedi le statistiche',
      },
    ],
  },
  {
    heading: '✨ Intelligenza artificiale',
    intro: 'Strumenti AI con un tetto di usi giornaliero.',
    tools: [
      {
        icon: '🌙',
        title: 'Stasera',
        body: 'Non sai cosa vedere? Dimmi umore e tempo a disposizione e scelgo io, tenendo conto di preferiti e visti.',
        to: '/ai?tab=tonight',
        cta: 'Apri «Stasera»',
      },
      {
        icon: '🎵',
        title: 'Canzone → film',
        body: 'Cerca i film che usano una certa canzone: l’AI cerca anche sul web.',
        to: '/ai',
        cta: 'Apri gli strumenti AI',
      },
      {
        icon: '📷',
        title: 'Foto → titoli',
        body: 'Carica un’immagine e l’AI riconosce titoli e persone. Utile per locandine, fotogrammi e volti.',
      },
      {
        icon: '🎬',
        title: 'Ordine delle saghe',
        body: 'Sulle collezioni, scegli l’ordine di visione: 📅 di uscita oppure 🤖 secondo la storia (ricostruito dall’AI).',
      },
    ],
  },
  {
    heading: '🎭 Profilo & extra',
    tools: [
      {
        icon: '🪪',
        title: 'Identità cinefila',
        body: 'In base ai tuoi gusti l’app ti propone un nickname, un avatar e un tema. Scegli la persona che ti rappresenta dal tuo Profilo.',
        to: '/profilo',
        cta: 'Apri il Profilo',
      },
      {
        icon: '🏆',
        title: 'Trofei & Badge',
        body: 'Sblocca trofei guardando film e serie ed equipaggia quello preferito per cambiare titolo, avatar e tema dell’app.',
        to: '/trophies',
        cta: 'Vedi i Trofei',
      },
      {
        icon: '🔔',
        title: 'Avvisi & notifiche',
        body: 'Segna «Avvisami» su un titolo in arrivo e attiva le notifiche push dalle Impostazioni per essere avvisato all’uscita.',
        to: '/in-arrivo',
        cta: 'In arrivo',
      },
    ],
  },
]

function ToolCard({ tool }: { tool: Tool }) {
  return (
    <div className="flex flex-col rounded-xl border border-theatre-800 bg-theatre-900/60 p-5">
      <div className="mb-2 text-3xl">{tool.icon}</div>
      <h3 className="font-display text-lg tracking-wide text-zinc-100">{tool.title}</h3>
      <p className="mt-1 flex-1 text-sm leading-relaxed text-zinc-400">{tool.body}</p>
      {tool.to && (
        <Link to={tool.to} className="mt-3 text-sm font-medium text-projector/80 hover:text-projector">
          {tool.cta ?? 'Apri'} →
        </Link>
      )}
    </div>
  )
}

export default function GuidePage() {
  const { user } = useAuth()

  return (
    <div>
      <PageHeader
        eyebrow="Benvenuto in Ciak"
        title="Guida & strumenti"
        subtitle="Tutto quello che puoi fare in Ciak, in un colpo d'occhio. Sei nuovo? Parti da «Per cominciare». Vuoi solo rinfrescarti? Scorri le sezioni."
      />

      {!user && (
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-projector/30 bg-projector/5 p-5">
          <p className="text-zinc-300">
            Accedi per sbloccare liste, diario, preferiti e suggerimenti AI su misura.
          </p>
          <Link to="/login" className="btn-primary">🎟️ Accedi</Link>
        </div>
      )}

      <div className="space-y-12">
        {SECTIONS.map((section) => (
          <section key={section.heading}>
            <h2 className="font-display text-2xl tracking-wide text-zinc-100">{section.heading}</h2>
            {section.intro && <p className="mt-1 text-sm text-zinc-500">{section.intro}</p>}
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {section.tools.map((tool) => (
                <ToolCard key={tool.title} tool={tool} />
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-12 rounded-2xl border border-dashed border-theatre-700 p-6 text-center">
        <p className="text-zinc-300">Pronto? Inizia ad aggiungere i tuoi titoli.</p>
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          <Link to="/search" className="btn-primary">🔍 Cerca & Esplora</Link>
          <Link to="/" className="btn-ghost">🎬 Vai alla Sala</Link>
        </div>
      </div>
    </div>
  )
}
