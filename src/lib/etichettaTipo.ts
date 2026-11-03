import type { MediaItem } from './types'

// Che cosa è un titolo, a parole: TMDB conosce solo film e serie, ma «Serie
// TV» sotto Konosuba o BoJack confonde. Anime e cartoni si riconoscono come
// nella ricerca: animazione (genere 16) e lingua originale.
export function etichettaTipo(item: Pick<MediaItem, 'mediaType' | 'genreIds' | 'originalLanguage'>): string {
  const animato = (item.genreIds ?? []).includes(16)
  if (item.mediaType === 'movie') return animato ? 'Film d’animazione' : 'Film'
  if (!animato) return 'Serie TV'
  return item.originalLanguage === 'ja' ? 'Anime' : 'Cartone'
}
