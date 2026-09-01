import type { MediaType } from './types'

// I filtri del diario, come logica pura: la pagina si limita a tradurre le sue
// voci in questa forma neutra e a chiedere «passa?». Così le regole — che sono
// la parte in cui si sbaglia — si provano in millisecondi invece che aprendo un
// browser e cliccando dei menu a tendina.

// Il tipo scelto nel filtro. `all` non filtra niente.
export type FiltroTipo = 'all' | MediaType

export interface FiltriDiario {
  query: string
  anno: string // 'all' oppure '2026'
  votoMin: number // 0 = qualsiasi
  tipo: FiltroTipo
  genere: number | 'all'
  soloConNota: boolean
}

export const FILTRI_VUOTI: FiltriDiario = {
  query: '',
  anno: 'all',
  votoMin: 0,
  tipo: 'all',
  genere: 'all',
  soloConNota: false,
}

// Una voce del diario ridotta a ciò che serve per decidere se mostrarla.
export interface VoceFiltrabile {
  mediaType: MediaType
  genreIds: number[]
  // Titolo + eventuale nota, già in minuscolo: la ricerca guarda dentro le
  // recensioni, non solo i titoli.
  testo: string
  anno: string
  voto: number | null
  haNota: boolean
}

export function passaIFiltri(v: VoceFiltrabile, f: FiltriDiario): boolean {
  if (f.anno !== 'all' && v.anno !== f.anno) return false
  if (f.tipo !== 'all' && v.mediaType !== f.tipo) return false
  // Il voto assente NON è zero: un film visto e non votato non deve comparire
  // sotto «1★ e oltre», che è una richiesta di titoli votati.
  if (f.votoMin > 0 && (v.voto ?? -1) < f.votoMin) return false
  if (f.genere !== 'all' && !v.genreIds.includes(f.genere)) return false
  if (f.soloConNota && !v.haNota) return false
  const q = f.query.trim().toLowerCase()
  if (q && !v.testo.includes(q)) return false
  return true
}

export function filtriAttivi(f: FiltriDiario): boolean {
  return (
    f.query.trim() !== '' ||
    f.anno !== 'all' ||
    f.votoMin > 0 ||
    f.tipo !== 'all' ||
    f.genere !== 'all' ||
    f.soloConNota
  )
}

// Quanti filtri sono attivi ESCLUSA la ricerca testuale, che resta sempre in
// vista: serve al pulsante «Filtri» del telefono per dire quanti ne hai messi
// senza doverlo aprire.
export function contaFiltriAttivi(f: FiltriDiario): number {
  return (
    (f.anno !== 'all' ? 1 : 0) +
    (f.votoMin > 0 ? 1 : 0) +
    (f.tipo !== 'all' ? 1 : 0) +
    (f.genere !== 'all' ? 1 : 0) +
    (f.soloConNota ? 1 : 0)
  )
}

export interface GenerePresente {
  id: number
  nome: string
  quanti: number
}

// I generi da mettere nel menu: solo quelli che compaiono davvero nel diario,
// col più frequente in cima. Un elenco con tutti i generi di TMDB sarebbe
// lungo il doppio e per tre quarti inutile — e sceglierne uno assente
// darebbe una pagina vuota senza spiegazione.
export function generiPresenti(
  voci: VoceFiltrabile[],
  nomi: Map<number, string>,
): GenerePresente[] {
  const conteggio = new Map<number, number>()
  for (const v of voci) {
    // Un titolo con tre generi conta una volta per ciascuno: è quello che serve
    // per rispondere a «quanti horror ho visto».
    for (const id of new Set(v.genreIds)) {
      conteggio.set(id, (conteggio.get(id) ?? 0) + 1)
    }
  }
  return [...conteggio.entries()]
    .filter(([id]) => nomi.has(id))
    .map(([id, quanti]) => ({ id, nome: nomi.get(id) as string, quanti }))
    .sort((a, b) => b.quanti - a.quanti || a.nome.localeCompare(b.nome))
}

// Le etichette del filtro «Tipo». Anime e cartoni sono tipi a sé in Ciak, non
// sottoinsiemi di «serie»: chi li tiene distinti nell'archivio se li aspetta
// distinti anche qui.
export const TIPI: { value: FiltroTipo; label: string }[] = [
  { value: 'all', label: 'Tutti' },
  { value: 'movie', label: 'Film' },
  { value: 'tv', label: 'Serie' },
  { value: 'anime', label: 'Anime' },
  { value: 'cartoon', label: 'Cartoni' },
]
