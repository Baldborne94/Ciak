import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'

// Tutorial + riferimento di tutti gli strumenti di Ciak, presentato come una
// serie di slide navigabili (frecce, puntini, tastiera). Pensata sia per chi
// apre l'app la prima volta sia per chi vuole rinfrescarsi su cosa c'è.
// Accessibile anche da ospite (niente login richiesto).

interface Tool {
  icon: string
  title: string
  body: string
  to?: string
  cta?: string
}

interface Slide {
  heading: string
  intro?: string
  tools: Tool[]
}

const SLIDES: Slide[] = [
  {
    heading: '🚀 Per cominciare',
    intro: 'Tre passi e sei operativo.',
    tools: [
      {
        icon: '🎟️',
        title: '1. Accedi',
        body: 'Crea un account con email e password (o Google). Serve per salvare liste, preferiti, diario e per i suggerimenti AI: i tuoi dati ti seguono su qualsiasi dispositivo.',
        to: '/login',
        cta: 'Vai al login',
      },
      {
        icon: '🔍',
        title: '2. Trova qualcosa',
        body: 'Usa «Cerca» per film, serie, anime, cartoni, persone, studi e saghe. A campo vuoto trovi le proposte di tendenza e sfogli per genere.',
        to: '/search',
        cta: 'Apri Cerca',
      },
      {
        icon: '🏷️',
        title: '3. Segna i titoli',
        body: 'Apri la scheda di un titolo e assegnagli uno stato: Da vedere, In corso, Visto o Abbandonato. Aggiungilo ai preferiti o a una lista. Da qui parte tutto.',
      },
    ],
  },
  {
    heading: '🔍 Cerca & Esplora',
    intro: 'Tutto il catalogo a portata di mano.',
    tools: [
      {
        icon: '🎬',
        title: 'Catalogo bilingue',
        body: 'Ricerca in italiano e inglese insieme. Filtri per Tipo (Film · Serie · ⛩️ Anime · 🎨 Cartoni) e voto minimo. I titoli stranieri restano leggibili.',
        to: '/search',
        cta: 'Cerca titoli',
      },
      {
        icon: '🧑‍🎤',
        title: 'Persone, Studi e Saghe',
        body: 'Attori, registi, compositori e sceneggiatori; studi di produzione; collezioni e franchise. Da una persona ritrovi al volo la filmografia.',
      },
      {
        icon: '🎞️',
        title: 'Scheda titolo',
        body: 'Trama, generi, voto, dove guardarlo in streaming (Italia), trailer, cast cliccabile, scheda tecnica e raccomandazioni.',
      },
    ],
  },
  {
    heading: '📋 Le tue liste',
    intro: 'Organizza e condividi.',
    tools: [
      {
        icon: '🎟️',
        title: 'Da vedere · In corso',
        body: 'Le liste fisse alimentate dagli stati dei titoli. La watchlist «Da vedere» puoi anche condividerla con un link pubblico.',
        to: '/lists/watchlist',
        cta: 'Apri «Da vedere»',
      },
      {
        icon: '🗂️',
        title: 'Liste personali',
        body: 'Crea liste a tema ("Neo-noir", "Da vedere con lei"…) con «Aggiungi a lista» dalla scheda. Rendile pubbliche e condividile.',
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
    intro: 'Tieni traccia di tutto ciò che guardi.',
    tools: [
      {
        icon: '📖',
        title: 'Diario di visione',
        body: 'Registra cosa guardi e quando, con voto e recensione. Supporta le rivisioni e i filtri per testo, anno e voto minimo.',
        to: '/diario',
        cta: 'Apri il Diario',
      },
      {
        icon: '📺',
        title: 'Stagioni ed episodi',
        body: 'Segni i singoli episodi: la serie passa da sola a «In corso» e a «Vista» quando la completi. In home trovi «Riprendi a guardare».',
      },
      {
        icon: '📊',
        title: 'Statistiche',
        body: 'Ore di film, generi preferiti, registi e attori più visti, distribuzione per decennio e «il tuo anno in film».',
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
        cta: 'Strumenti AI',
      },
      {
        icon: '📷',
        title: 'Foto → titoli',
        body: 'Carica un’immagine e l’AI riconosce titoli e persone: locandine, fotogrammi, volti.',
      },
      {
        icon: '🎬',
        title: 'Ordine delle saghe',
        body: 'Sulle collezioni scegli l’ordine: 📅 di uscita oppure 🤖 secondo la storia (ricostruito dall’AI).',
      },
    ],
  },
  {
    heading: '🎭 Profilo & extra',
    intro: 'Personalizza la tua esperienza.',
    tools: [
      {
        icon: '🪪',
        title: 'Identità cinefila',
        body: 'In base ai tuoi gusti l’app ti propone nickname, avatar e tema. Scegli la persona che ti rappresenta dal Profilo.',
        to: '/profilo',
        cta: 'Apri il Profilo',
      },
      {
        icon: '🏆',
        title: 'Trofei & Badge',
        body: 'Sblocca trofei guardando film e serie ed equipaggia il preferito per cambiare titolo, avatar e tema dell’app.',
        to: '/trophies',
        cta: 'Vedi i Trofei',
      },
      {
        icon: '🔔',
        title: 'Avvisi & notifiche',
        body: 'Segna «Avvisami» su un titolo in arrivo e attiva le notifiche push dalle Impostazioni per l’uscita.',
        to: '/in-arrivo',
        cta: 'In arrivo',
      },
    ],
  },
]

function ToolCard({ tool }: { tool: Tool }) {
  return (
    <div className="flex flex-col rounded-xl border border-theatre-800 bg-theatre-950/40 p-4 text-left">
      <div className="mb-2 text-2xl">{tool.icon}</div>
      <h3 className="font-display text-base tracking-wide text-zinc-100">{tool.title}</h3>
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
  const [index, setIndex] = useState(0)
  const total = SLIDES.length
  const isLast = index === total - 1

  const go = useCallback(
    (delta: number) => setIndex((i) => Math.min(total - 1, Math.max(0, i + delta))),
    [total],
  )

  // Navigazione da tastiera con le frecce ← →.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go])

  const slide = SLIDES[index]

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
          Guida & strumenti
        </p>
        <Link to="/" className="text-sm text-zinc-500 hover:text-zinc-300">
          Salta ✕
        </Link>
      </div>

      {/* Barra di avanzamento */}
      <div className="mb-8 flex gap-1.5">
        {SLIDES.map((s, i) => (
          <button
            key={s.heading}
            onClick={() => setIndex(i)}
            aria-label={`Vai alla slide ${i + 1}: ${s.heading}`}
            className={`h-1.5 flex-1 rounded-full transition ${
              i <= index ? 'bg-projector' : 'bg-theatre-800'
            }`}
          />
        ))}
      </div>

      {/* Slide */}
      <div className="rounded-3xl border border-theatre-800 bg-theatre-900/60 p-6 sm:p-10">
        <p className="text-sm text-zinc-500">
          {index + 1} / {total}
        </p>
        <h2 className="mt-1 font-display text-3xl tracking-wide text-zinc-100 sm:text-4xl">
          {slide.heading}
        </h2>
        {slide.intro && <p className="mt-2 text-zinc-400">{slide.intro}</p>}

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {slide.tools.map((tool) => (
            <ToolCard key={tool.title} tool={tool} />
          ))}
        </div>

        {!user && index === 0 && (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-projector/30 bg-projector/5 p-4">
            <p className="text-sm text-zinc-300">
              Accedi per sbloccare liste, diario, preferiti e suggerimenti AI su misura.
            </p>
            <Link to="/login" className="btn-primary">🎟️ Accedi</Link>
          </div>
        )}
      </div>

      {/* Controlli */}
      <div className="mt-6 flex items-center justify-between gap-3">
        <button
          onClick={() => go(-1)}
          disabled={index === 0}
          className="btn-ghost disabled:cursor-not-allowed disabled:opacity-30"
        >
          ← Indietro
        </button>

        {/* Puntini cliccabili */}
        <div className="hidden items-center gap-2 sm:flex">
          {SLIDES.map((s, i) => (
            <button
              key={s.heading}
              onClick={() => setIndex(i)}
              aria-label={`Slide ${i + 1}`}
              className={`h-2.5 w-2.5 rounded-full transition ${
                i === index ? 'bg-projector' : 'bg-theatre-700 hover:bg-theatre-600'
              }`}
            />
          ))}
        </div>

        {isLast ? (
          <Link to={user ? '/search' : '/login'} className="btn-primary">
            {user ? '🔍 Inizia a esplorare' : '🎟️ Accedi e inizia'}
          </Link>
        ) : (
          <button onClick={() => go(1)} className="btn-primary">
            Avanti →
          </button>
        )}
      </div>
    </div>
  )
}
