import type { MediaItem, UserTitle } from './types'

// «I più belli che mi mancano»: si parte dai titoli col voto più alto su TMDB e
// si toglie tutto quello che è già nel tuo archivio. La parte difficile non è
// la sottrazione, è che dopo la sottrazione resti qualcosa da guardare.

// Gli id TMDB sono unici solo dentro un tipo: un film e una serie possono
// avere lo stesso numero, quindi la chiave è sempre la coppia.
export function chiave(mediaType: string, tmdbId: number): string {
  return `${mediaType}-${tmdbId}`
}

// Tutto ciò che l'utente ha già in archivio, in qualunque stato. Anche gli
// abbandonati e i «da vedere»: un film che hai già in lista non è un
// suggerimento, è una cosa che sai già.
//
// I tipi di Ciak (anime, cartoon) corrispondono a `tv` su TMDB: senza questa
// traduzione un anime già visto tornerebbe fra i suggerimenti.
export function chiaviConosciute(titoli: UserTitle[]): Set<string> {
  const s = new Set<string>()
  for (const t of titoli) {
    const tmdb = t.media_type === 'movie' ? 'movie' : 'tv'
    s.add(chiave(tmdb, t.tmdb_id))
  }
  return s
}

export function escludiConosciuti(items: MediaItem[], conosciute: Set<string>): MediaItem[] {
  return items.filter((i) => !conosciute.has(chiave(i.mediaType, i.id)))
}

// I generi che guardi di più, per la modalità «nei miei generi». Pesati sul
// numero di titoli, non sui voti: qui interessa cosa frequenti, non cosa
// giudichi meglio.
export function generiPreferiti(titoli: UserTitle[], quanti = 3): number[] {
  const conteggio = new Map<number, number>()
  for (const t of titoli) {
    for (const g of new Set(t.genre_ids ?? [])) {
      conteggio.set(g, (conteggio.get(g) ?? 0) + 1)
    }
  }
  return [...conteggio.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, quanti)
    .map(([id]) => id)
}

// Gli estremi di un decennio, nella forma che TMDB accetta.
export function intervalloDecennio(decennio: number): { dal: string; al: string } {
  return { dal: `${decennio}-01-01`, al: `${decennio + 9}-12-31` }
}

export interface PaginaRecuperi {
  items: MediaItem[]
  prossimaPagina: number | null
}

// Riempie una schermata di suggerimenti, non una pagina di TMDB.
//
// La differenza conta: TMDB ne manda venti alla volta, e a chi ha visto molto
// possono essere tutti già visti. Mostrare «tre film» perché la pagina uno era
// quasi tutta roba sua sarebbe un risultato sbagliato — quindi si continua a
// sfogliare finché non se ne raccolgono abbastanza, o finché le pagine
// finiscono.
export async function raccogliNonVisti(
  carica: (page: number) => Promise<{ items: MediaItem[]; totalPages: number }>,
  conosciute: Set<string>,
  opzioni: { da?: number; quanti?: number; maxPagine?: number } = {},
): Promise<PaginaRecuperi> {
  const da = opzioni.da ?? 1
  const quanti = opzioni.quanti ?? 20
  const maxPagine = opzioni.maxPagine ?? 5

  const raccolti: MediaItem[] = []
  // TMDB può ripetere lo stesso titolo fra una pagina e l'altra: senza questo
  // un film comparirebbe due volte nella stessa schermata.
  const visti = new Set<string>()
  let pagina = da
  let ultima = da

  for (let i = 0; i < maxPagine && raccolti.length < quanti; i++) {
    const { items, totalPages } = await carica(pagina)
    for (const item of escludiConosciuti(items, conosciute)) {
      const k = chiave(item.mediaType, item.id)
      if (visti.has(k)) continue
      visti.add(k)
      raccolti.push(item)
    }
    ultima = pagina
    if (pagina >= totalPages) {
      return { items: raccolti.slice(0, quanti), prossimaPagina: null }
    }
    pagina++
  }

  return {
    items: raccolti.slice(0, quanti),
    // Si riparte dalla pagina dopo l'ultima letta, così «Carica altri» non
    // rilegge quello che ha già scartato.
    prossimaPagina: ultima + 1,
  }
}
