// TMDB genre IDs
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

export type AchievementRarity = 'bronze' | 'silver' | 'gold' | 'platinum'

export interface Achievement {
  id: string
  title: string
  subtitle: string
  emoji: string
  avatar: string     // large decorative art shown in profile
  rarity: AchievementRarity
  theme: string      // CSS data-theme value
  check: (d: AchievementData) => boolean
}

export interface AchievementData {
  totalWatched: number
  totalFavorites: number
  totalRatings: number
  fiveStarCount: number
  withNotes: number
  inProgress: number
  genreCounts: Record<number, number>
}

export const ACHIEVEMENTS: Achievement[] = [
  // ── Milestone ─────────────────────────────────────────────────────
  {
    id: 'first_watch',
    title: 'Prima Proiezione',
    subtitle: 'Il tuo primo titolo visto. Benvenuto in sala!',
    emoji: '🎬', avatar: '🎞️',
    rarity: 'bronze', theme: 'default',
    check: (d) => d.totalWatched >= 1,
  },
  {
    id: 'ten_watched',
    title: 'Cliente Fisso',
    subtitle: 'Hai visto 10 titoli. Stai prendendo gusto.',
    emoji: '🍿', avatar: '🎟️',
    rarity: 'bronze', theme: 'default',
    check: (d) => d.totalWatched >= 10,
  },
  {
    id: 'twentyfive_watched',
    title: 'Cinefilo',
    subtitle: 'Hai visto 25 titoli. Il cinema è la tua seconda casa.',
    emoji: '🎭', avatar: '🎭',
    rarity: 'silver', theme: 'default',
    check: (d) => d.totalWatched >= 25,
  },
  {
    id: 'fifty_watched',
    title: 'Maestro del Cinema',
    subtitle: 'Hai visto 50 titoli. Una cinefilia seria.',
    emoji: '🏆', avatar: '🎦',
    rarity: 'gold', theme: 'gold',
    check: (d) => d.totalWatched >= 50,
  },
  {
    id: 'hundred_watched',
    title: 'Direttore di Sala',
    subtitle: 'Hai visto 100 titoli. Il cinema è la tua vita.',
    emoji: '👑', avatar: '👑',
    rarity: 'platinum', theme: 'platinum',
    check: (d) => d.totalWatched >= 100,
  },
  // ── Genere ────────────────────────────────────────────────────────
  {
    id: 'horror_fan',
    title: 'Il Mostro',
    subtitle: 'Hai visto 5 o più horror. Dormi ancora?',
    emoji: '👹', avatar: '🩸',
    rarity: 'silver', theme: 'horror',
    check: (d) => (d.genreCounts[G.horror] ?? 0) >= 5,
  },
  {
    id: 'action_fan',
    title: 'Adrenalina Pura',
    subtitle: 'Hai visto 5 o più action. Mai un momento di noia.',
    emoji: '💥', avatar: '🔥',
    rarity: 'bronze', theme: 'action',
    check: (d) => (d.genreCounts[G.action] ?? 0) >= 5,
  },
  {
    id: 'scifi_fan',
    title: 'Viaggiatore Galattico',
    subtitle: "Hai visto 5 o più sci-fi. L'universo è il tuo cinema.",
    emoji: '🚀', avatar: '🌌',
    rarity: 'silver', theme: 'scifi',
    check: (d) => (d.genreCounts[G.scifi] ?? 0) >= 5,
  },
  {
    id: 'romance_fan',
    title: 'Cuore Tenero',
    subtitle: 'Hai visto 3 o più romanticoni. Ammettilo.',
    emoji: '💘', avatar: '💝',
    rarity: 'bronze', theme: 'romance',
    check: (d) => (d.genreCounts[G.romance] ?? 0) >= 3,
  },
  {
    id: 'comedy_fan',
    title: 'Re della Risata',
    subtitle: 'Hai visto 5 o più commedie. La vita è bella.',
    emoji: '😂', avatar: '🎪',
    rarity: 'bronze', theme: 'default',
    check: (d) => (d.genreCounts[G.comedy] ?? 0) >= 5,
  },
  {
    id: 'fantasy_fan',
    title: 'Guardiano dei Mondi',
    subtitle: 'Hai visto 5 o più fantasy. La magia esiste.',
    emoji: '🧙', avatar: '🔮',
    rarity: 'silver', theme: 'fantasy',
    check: (d) => (d.genreCounts[G.fantasy] ?? 0) >= 5,
  },
  {
    id: 'crime_fan',
    title: "L'Ispettore",
    subtitle: 'Hai visto 5 o più crime/mystery. Chi è il colpevole?',
    emoji: '🕵️', avatar: '🔍',
    rarity: 'silver', theme: 'crime',
    check: (d) =>
      (d.genreCounts[G.crime] ?? 0) + (d.genreCounts[G.mystery] ?? 0) >= 5,
  },
  {
    id: 'thriller_fan',
    title: 'Il Paranoico',
    subtitle: 'Hai visto 5 o più thriller. Guarda le spalle.',
    emoji: '🔪', avatar: '😰',
    rarity: 'silver', theme: 'horror',
    check: (d) => (d.genreCounts[G.thriller] ?? 0) >= 5,
  },
  {
    id: 'anime_fan',
    title: 'Otaku',
    subtitle: 'Hai visto 5 o più titoli animati. Sugoi!',
    emoji: '⛩️', avatar: '🌸',
    rarity: 'silver', theme: 'anime',
    check: (d) => (d.genreCounts[G.animation] ?? 0) >= 5,
  },
  {
    id: 'western_fan',
    title: 'Lo Straniero',
    subtitle: 'Hai visto 3 o più western. Pistole al tramonto.',
    emoji: '🤠', avatar: '🌵',
    rarity: 'bronze', theme: 'western',
    check: (d) => (d.genreCounts[G.western] ?? 0) >= 3,
  },
  {
    id: 'history_fan',
    title: 'Il Professore',
    subtitle: 'Hai visto 5 o più drama/storici. La storia insegna.',
    emoji: '📚', avatar: '🏛️',
    rarity: 'bronze', theme: 'default',
    check: (d) =>
      (d.genreCounts[G.history] ?? 0) + (d.genreCounts[G.drama] ?? 0) >= 5,
  },
  // ── Speciali ──────────────────────────────────────────────────────
  {
    id: 'collector',
    title: 'Il Grande Collezionista',
    subtitle: 'Hai aggiunto 15 titoli ai preferiti.',
    emoji: '❤️', avatar: '💎',
    rarity: 'silver', theme: 'romance',
    check: (d) => d.totalFavorites >= 15,
  },
  {
    id: 'critic',
    title: 'Critico Esigente',
    subtitle: 'Hai votato 10 o più titoli.',
    emoji: '⭐', avatar: '✍️',
    rarity: 'silver', theme: 'gold',
    check: (d) => d.totalRatings >= 10,
  },
  {
    id: 'perfectionist',
    title: 'Il Perfezionista',
    subtitle: 'Hai dato 5 stelle a 5 o più titoli.',
    emoji: '🎯', avatar: '🌟',
    rarity: 'gold', theme: 'gold',
    check: (d) => d.fiveStarCount >= 5,
  },
  {
    id: 'reviewer',
    title: 'Il Recensore',
    subtitle: 'Hai scritto note su 5 o più titoli.',
    emoji: '📝', avatar: '🖊️',
    rarity: 'bronze', theme: 'default',
    check: (d) => d.withNotes >= 5,
  },
  {
    id: 'binge_master',
    title: 'Binge Master',
    subtitle: 'Stai seguendo 3 o più serie in contemporanea.',
    emoji: '📺', avatar: '🛋️',
    rarity: 'silver', theme: 'scifi',
    check: (d) => d.inProgress >= 3,
  },
]

export function computeAchievementData(
  titles: {
    status: string
    is_favorite: boolean
    personal_rating: number | null
    notes: string | null
    genre_ids: number[]
  }[],
): AchievementData {
  const watched = titles.filter((t) => t.status === 'watched')
  const genreCounts: Record<number, number> = {}
  for (const t of watched) {
    for (const g of t.genre_ids ?? []) {
      genreCounts[g] = (genreCounts[g] ?? 0) + 1
    }
  }
  return {
    totalWatched: watched.length,
    totalFavorites: titles.filter((t) => t.is_favorite).length,
    totalRatings: titles.filter((t) => t.personal_rating != null).length,
    fiveStarCount: titles.filter((t) => t.personal_rating === 5).length,
    withNotes: titles.filter((t) => !!t.notes?.trim()).length,
    inProgress: titles.filter((t) => t.status === 'in_progress').length,
    genreCounts,
  }
}

export function getEarnedIds(data: AchievementData): string[] {
  return ACHIEVEMENTS.filter((a) => a.check(data)).map((a) => a.id)
}

export const RARITY_STYLES: Record<AchievementRarity, string> = {
  bronze: 'border-amber-700/60 bg-amber-950/20 text-amber-400',
  silver: 'border-zinc-500/60 bg-zinc-800/20 text-zinc-300',
  gold: 'border-projector/60 bg-projector/10 text-projector',
  platinum: 'border-curtain-light/60 bg-curtain/10 text-curtain-light',
}

export const RARITY_LABELS: Record<AchievementRarity, string> = {
  bronze: 'Bronzo',
  silver: 'Argento',
  gold: 'Oro',
  platinum: 'Platino',
}
