// Identità Cinefila: in base ai film che l'utente ha visto/preferito,
// determina un "tipo di cinefilo" (persona) e ne deriva tema, avatar e nickname.
// Tutto deterministico (nessuna chiamata AI): a parità di gusti il risultato è
// stabile; «Rigenera» fa solo variare nickname e avatar dentro la stessa persona.

// ID generi TMDB (gli stessi usati per i vecchi trofei).
const G = {
  action: 28,
  animation: 16,
  comedy: 35,
  crime: 80,
  drama: 18,
  fantasy: 14,
  history: 36,
  horror: 27,
  mystery: 9648,
  romance: 10749,
  scifi: 878,
  thriller: 53,
  western: 37,
}

export interface Persona {
  id: string
  label: string // il "tipo di cinefilo" (es. «Anima del Brivido»)
  tagline: string // breve descrizione dello stile
  emoji: string
  theme: string // valore CSS data-theme (deve esistere in index.css)
  avatarStyle: string // stile DiceBear (https://dicebear.com)
  genres: number[] // generi TMDB che alimentano questa persona
  nicknames: string[] // pool da cui pescare il nickname (deterministico)
}

// Persona di ripiego quando i dati sono pochi o non c'è un genere dominante.
export const CALIBRATING: Persona = {
  id: 'calibrating',
  label: 'Spettatore in Erba',
  tagline: 'Guarda ancora qualche film: sto imparando i tuoi gusti.',
  emoji: '🎬',
  theme: 'default',
  avatarStyle: 'thumbs',
  genres: [],
  nicknames: ['Spettatore Curioso', 'Nuovo in Sala', 'Esploratore di Storie'],
}

// Ordine = priorità a parità di punteggio (le prime vincono).
export const PERSONAS: Persona[] = [
  {
    id: 'horror',
    label: 'Anima del Brivido',
    tagline: 'Vivi per la tensione, il buio e i brividi.',
    emoji: '👻',
    theme: 'horror',
    avatarStyle: 'pixel-art',
    genres: [G.horror, G.thriller],
    nicknames: ['Anima Notturna', 'Custode del Buio', 'Spettro della Sala', 'Voce nel Buio', 'Brivido Eterno'],
  },
  {
    id: 'scifi',
    label: 'Esploratore Galattico',
    tagline: 'Il tuo cinema guarda sempre oltre le stelle.',
    emoji: '🚀',
    theme: 'scifi',
    avatarStyle: 'bottts',
    genres: [G.scifi],
    nicknames: ['Viaggiatore Stellare', 'Mente Quantica', 'Esploratore di Mondi', 'Pioniere Galattico', 'Sognatore Cosmico'],
  },
  {
    id: 'fantasy',
    label: 'Sognatore Fantastico',
    tagline: 'Cerchi mondi impossibili e meraviglie.',
    emoji: '🐉',
    theme: 'fantasy',
    avatarStyle: 'lorelei',
    genres: [G.fantasy],
    nicknames: ['Cantastorie', 'Custode dei Reami', 'Evocatore di Meraviglie', 'Cercatore di Magie', 'Guardiano dei Mondi'],
  },
  {
    id: 'anime',
    label: 'Spirito Animato',
    tagline: "Il disegno e l'animazione sono la tua firma.",
    emoji: '🌸',
    theme: 'anime',
    avatarStyle: 'fun-emoji',
    genres: [G.animation],
    nicknames: ['Spirito Animato', 'Sognatore Disegnato', 'Anima Pop', 'Cuore Otaku', 'Pennello Vivente'],
  },
  {
    id: 'romance',
    label: 'Cuore Romantico',
    tagline: "Le grandi storie d'amore ti conquistano.",
    emoji: '❤️',
    theme: 'romance',
    avatarStyle: 'big-smile',
    genres: [G.romance],
    nicknames: ['Cuore Romantico', 'Anima Gentile', 'Eterno Innamorato', 'Sognatore Sentimentale', 'Tenero Spettatore'],
  },
  {
    id: 'action',
    label: "Cuore d'Azione",
    tagline: 'Ritmo, azione e adrenalina, sempre.',
    emoji: '💥',
    theme: 'action',
    avatarStyle: 'micah',
    genres: [G.action],
    nicknames: ['Adrenalina Pura', 'Eroe Senza Sosta', 'Cuore Esplosivo', 'Spirito Indomito', 'Senza Freni'],
  },
  {
    id: 'crime',
    label: 'Detective della Sala',
    tagline: 'Ami intrighi, indagini e colpi di scena.',
    emoji: '🕵️',
    theme: 'crime',
    avatarStyle: 'personas',
    genres: [G.crime, G.mystery],
    nicknames: ['Detective Notturno', 'Mente Investigativa', 'Ombra del Noir', 'Segugio della Sala', 'Occhio Acuto'],
  },
  {
    id: 'western',
    label: 'Spirito di Frontiera',
    tagline: 'Polvere, orizzonti e duelli al tramonto.',
    emoji: '🤠',
    theme: 'western',
    avatarStyle: 'adventurer',
    genres: [G.western],
    nicknames: ['Pistolero Solitario', 'Spirito di Frontiera', 'Cavaliere del Tramonto', 'Vagabondo del West', 'Anima Selvaggia'],
  },
  {
    id: 'comedy',
    label: 'Anima Brillante',
    tagline: 'Ridere è il tuo genere preferito.',
    emoji: '😂',
    theme: 'gold',
    avatarStyle: 'croodles',
    genres: [G.comedy],
    nicknames: ['Re della Risata', 'Anima Brillante', 'Spirito Allegro', 'Cuore Leggero', 'Sorriso in Sala'],
  },
  {
    id: 'drama',
    label: 'Anima Profonda',
    tagline: 'Cerchi storie intense e personaggi veri.',
    emoji: '🎭',
    theme: 'platinum',
    avatarStyle: 'notionists',
    genres: [G.drama, G.history],
    nicknames: ['Anima Profonda', 'Spettatore Sensibile', 'Cuore Pensoso', "Cronista dell'Anima", 'Sguardo Intenso'],
  },
]

export interface CinephileIdentity {
  personaId: string
  nickname: string
  theme: string
  avatarStyle: string
  avatarSeed: string
}

export interface TasteInput {
  status: string
  is_favorite: boolean
  personal_rating: number | null
  genre_ids: number[]
}

export interface IdentityAnalysis {
  persona: Persona
  watchedCount: number
  topGenreIds: number[]
}

// URL dell'avatar generato da DiceBear (SVG, nessuna libreria da installare:
// è solo un'immagine remota caricata dal browser dell'utente a runtime).
export function avatarUrl(style: string, seed: string): string {
  return `https://api.dicebear.com/9.x/${style}/svg?seed=${encodeURIComponent(seed)}`
}

// Determina la persona dominante pesando i generi: i preferiti e i voti alti
// contano di più dei semplici "visti".
export function analyzeTaste(titles: TasteInput[]): IdentityAnalysis {
  const taste = titles.filter((t) => t.status === 'watched' || t.is_favorite)
  const watchedCount = titles.filter((t) => t.status === 'watched').length

  const weighted: Record<number, number> = {}
  for (const t of taste) {
    let w = 1
    if (t.is_favorite) w += 1
    if ((t.personal_rating ?? 0) >= 4) w += 1
    for (const g of t.genre_ids ?? []) weighted[g] = (weighted[g] ?? 0) + w
  }

  let best: Persona = CALIBRATING
  let bestScore = 0
  for (const p of PERSONAS) {
    const score = p.genres.reduce((s, g) => s + (weighted[g] ?? 0), 0)
    if (score > bestScore) {
      bestScore = score
      best = p
    }
  }
  // Servono almeno un po' di dati e un genere dominante reale.
  if (watchedCount < 3 || bestScore === 0) best = CALIBRATING

  const topGenreIds = Object.entries(weighted)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([g]) => Number(g))

  return { persona: best, watchedCount, topGenreIds }
}

// Costruisce un'identità concreta dalla persona: la "variante" sceglie nickname
// e seme dell'avatar in modo deterministico (usata da «Rigenera»).
export function buildIdentity(persona: Persona, variant: number): CinephileIdentity {
  const pool = persona.nicknames
  const idx = ((variant % pool.length) + pool.length) % pool.length
  const nickname = pool[idx]
  return {
    personaId: persona.id,
    nickname,
    theme: persona.theme,
    avatarStyle: persona.avatarStyle,
    avatarSeed: `${persona.id}-${nickname}`,
  }
}

export function personaById(id: string | null | undefined): Persona | null {
  if (!id) return null
  if (id === CALIBRATING.id) return CALIBRATING
  return PERSONAS.find((p) => p.id === id) ?? null
}
