import type { MediaItem } from './types'

// Un titolo proposto dall'AI («The Witch», 2015, un film) va abbinato al titolo
// giusto di TMDB, per la locandina, la scheda e soprattutto per scartare i già
// visti, che si riconoscono dall'id. Il primo omonimo non basta: «The Witch» di
// Eggers in italiano si chiama in un altro modo, e vinceva un drama coreano del
// 2025 col titolo identico; «The Wailing» (2016) diventava un horror spagnolo
// del 2024. Contano quindi anche il titolo inglese, l'anno e il tipo, e un
// risultato che non somiglia per niente non si abbina: meglio una proposta
// senza locandina che la scheda di un altro film.

export interface TitoloCercato {
  titolo: string
  anno?: string | number | null
  // Ciò che l'AI ha proposto, se lo si sa: un film o una serie.
  tipo?: 'movie' | 'tv' | null
}

// Minuscolo, senza accenti né punteggiatura. Un titolo in un altro alfabeto
// (곡성) resta vuoto: si confronta con gli altri titoli dello stesso risultato.
function normalizza(t: string | null | undefined): string {
  return (t ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function coppie(t: string): Set<string> {
  const fatte = new Set<string>()
  for (let i = 0; i < t.length - 1; i++) fatte.add(t.slice(i, i + 2))
  return fatte
}

// Quanto si somigliano due titoli, da 0 a 1 (coefficiente di Dice sulle coppie
// di lettere): «thewitch» e «thevvitch» si somigliano, «goksung» e
// «thewailing» no.
export function somiglianza(a: string, b: string): number {
  if (!a || !b) return 0
  if (a === b) return 1
  const ca = coppie(a)
  const cb = coppie(b)
  if (ca.size === 0 || cb.size === 0) return 0
  let comuni = 0
  for (const c of ca) if (cb.has(c)) comuni++
  return (2 * comuni) / (ca.size + cb.size)
}

// Sotto questa somiglianza un risultato non è il titolo cercato, qualunque
// cosa dicano anno e tipo.
const SOGLIA = 0.5

function punteggio(cercato: TitoloCercato, r: MediaItem): { punti: number; simile: number } {
  const bersaglio = normalizza(cercato.titolo)
  const simile = Math.max(...[r.title, r.originalTitle, r.englishTitle].map((t) => somiglianza(bersaglio, normalizza(t))))
  let punti = simile * 10
  const anno = Number(cercato.anno)
  const suo = Number(r.releaseDate?.slice(0, 4))
  if (anno && suo) {
    // Un anno di scarto è normale (festival e uscita in sala); di più è un altro titolo.
    const scarto = Math.abs(anno - suo)
    punti += scarto === 0 ? 6 : scarto === 1 ? 3 : -6
  }
  if (cercato.tipo) punti += r.mediaType === cercato.tipo ? 4 : -4
  // A parità, il titolo noto batte l'omonimo sconosciuto.
  punti += r.voteAverage * 0.1
  return { punti, simile }
}

export function abbinaTitolo(cercato: TitoloCercato, risultati: MediaItem[]): MediaItem | null {
  let migliore: { r: MediaItem; punti: number } | null = null
  for (const r of risultati) {
    const { punti, simile } = punteggio(cercato, r)
    if (simile < SOGLIA) continue
    if (!migliore || punti > migliore.punti) migliore = { r, punti }
  }
  return migliore?.r ?? null
}
