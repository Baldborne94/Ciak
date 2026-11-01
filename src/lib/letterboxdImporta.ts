import { abbinaTitolo } from './abbinaTitoloAi'
import { listDiary, importaVisioni } from './diary'
import { chiaveFilm, filmDellExport, type ExportLetterboxd, type FilmLetterboxd } from './letterboxd'
import { pianoImport, type PianoImport } from './letterboxdPiano'
import { aggiungiTitoliAllaLista, createList, listLists } from './lists'
import { logFailure } from './logFailure'
import { mapLimit } from './mapLimit'
import { cercaFilm } from './tmdb'
import type { MediaItem } from './types'
import { importaTitoli, listAll } from './userTitles'

// L'importazione da Letterboxd, in due tempi: prima si cercano i film su TMDB
// e si prepara il piano (niente si scrive), poi, se lo si conferma, si scrive.

// Un film di Letterboxd su TMDB: per nome e anno. Letterboxd usa i titoli
// inglesi («Spirited Away»), che la ricerca in italiano non sempre riconosce
// come lo stesso film: allora si riprova in inglese, e infine senza anno (le
// date d'uscita dei due siti a volte differiscono di uno). Del film trovato si
// tiene la versione italiana, se c'è, per il titolo da mostrare.
async function abbinaUno(f: FilmLetterboxd): Promise<MediaItem | null> {
  const cercato = { titolo: f.nome, anno: f.anno, tipo: 'movie' as const }
  const italiano = await cercaFilm(f.nome, f.anno, 'it-IT')
  const trovato = abbinaTitolo(cercato, italiano)
  if (trovato) return trovato
  for (const anno of f.anno ? [f.anno, null] : [null]) {
    const inglese = abbinaTitolo(cercato, await cercaFilm(f.nome, anno, 'en-US'))
    if (inglese) return italiano.find((r) => r.id === inglese.id) ?? inglese
  }
  return null
}

export async function abbinaFilm(
  e: ExportLetterboxd,
  avanzamento: (fatti: number, totale: number) => void,
): Promise<Map<string, MediaItem | null>> {
  const film = filmDellExport(e)
  let fatti = 0
  let falliti = 0
  let ultimo: unknown = null
  const esiti = await mapLimit(film, 6, async (f) => {
    let item: MediaItem | null = null
    try {
      item = await abbinaUno(f)
    } catch (err) {
      falliti++
      ultimo = err
    }
    avanzamento(++fatti, film.length)
    return [chiaveFilm(f), item] as const
  })
  // Una volta col totale, non a ogni film.
  if (falliti > 0) logFailure(`Film di Letterboxd non cercati su TMDB: ${falliti} su ${film.length}`)(ultimo)
  return new Map(esiti)
}

export async function preparaImport(userId: string, e: ExportLetterboxd, abbinati: Map<string, MediaItem | null>): Promise<PianoImport> {
  const [titoli, diario, liste] = await Promise.all([listAll(userId), listDiary(userId), listLists(userId)])
  return pianoImport(userId, e, abbinati, titoli, diario, liste)
}

export async function eseguiImport(userId: string, piano: PianoImport, passo: (testo: string) => void): Promise<void> {
  passo(`Salvo ${piano.titoli.length} titoli…`)
  await importaTitoli(piano.titoli, (n) => passo(`Salvo i titoli: ${n} di ${piano.titoli.length}…`))
  passo(`Salvo ${piano.diario.length} visioni nel diario…`)
  await importaVisioni(piano.diario, (n) => passo(`Salvo il diario: ${n} di ${piano.diario.length}…`))
  for (const [i, l] of piano.liste.entries()) {
    passo(`Salvo le liste: ${i + 1} di ${piano.liste.length}…`)
    const id = l.esistente ?? (await createList(userId, l.nome, l.descrizione)).id
    await aggiungiTitoliAllaLista(
      userId,
      id,
      l.titoli.map((t) => ({ tmdbId: t.id, mediaType: t.mediaType, title: t.title, posterPath: t.posterPath })),
    )
  }
}
