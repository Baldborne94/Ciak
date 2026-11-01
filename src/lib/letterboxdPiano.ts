import { chiaveFilm, filmDellExport, type ExportLetterboxd, type FilmLetterboxd } from './letterboxd'
import type { DiaryEntry, MediaItem, UserList, UserTitle } from './types'

// Cosa scrivere in Ciak da un'esportazione di Letterboxd (vedi letterboxd.ts),
// dati i film trovati su TMDB e ciò che c'è già. Ciò che hai in Ciak vince:
// - un film visto non torna «da vedere»;
// - un voto, una nota, una data di visione già in Ciak restano;
// - un «Preferito» non si toglie, si aggiunge con un «mi piace»;
// - una visione già nel diario (stesso film, stesso giorno) non si duplica.
// Così l'importazione si può rifare, per esempio dopo nuove visioni su
// Letterboxd: aggiunge solo ciò che manca.

export type RigaTitolo = Omit<UserTitle, 'id' | 'created_at' | 'updated_at'>
export type RigaDiario = Omit<DiaryEntry, 'id' | 'created_at'>

export interface PianoImport {
  titoli: RigaTitolo[]
  diario: RigaDiario[]
  liste: { nome: string; descrizione: string | null; esistente: string | null; titoli: MediaItem[] }[]
  nonTrovati: FilmLetterboxd[]
  conteggi: { visti: number; daVedere: number; voti: number; preferiti: number; note: number; visioni: number; liste: number }
}

const piuRecente = (a: string | null, b: string | null) => (!a ? b : !b ? a : a > b ? a : b)

export function pianoImport(
  userId: string,
  e: ExportLetterboxd,
  abbinati: Map<string, MediaItem | null>,
  esistenti: Pick<UserTitle, 'tmdb_id' | 'media_type' | 'title' | 'poster_path' | 'genre_ids' | 'status' | 'is_favorite' | 'personal_rating' | 'notes' | 'watched_at' | 'rewatch'>[],
  diarioEsistente: Pick<DiaryEntry, 'tmdb_id' | 'media_type' | 'watched_on'>[],
  listeEsistenti: Pick<UserList, 'id' | 'name'>[],
): PianoImport {
  const titoloDi = (f: FilmLetterboxd) => abbinati.get(chiaveFilm(f)) ?? null
  const chiave = (t: { mediaType: string; id: number }) => `${t.mediaType}-${t.id}`

  // Tutto ciò che l'esportazione dice di ogni titolo trovato.
  interface Dati {
    item: MediaItem
    visto: boolean
    quando: string | null
    voto: number | null
    votoDiario: { voto: number; visto: string } | null
    daVedere: boolean
    piace: boolean
    nota: { testo: string; visto: string | null } | null
  }
  const dati = new Map<string, Dati>()
  const di = (f: FilmLetterboxd): Dati | null => {
    const item = titoloDi(f)
    if (!item) return null
    const k = chiave(item)
    let d = dati.get(k)
    if (!d) {
      d = { item, visto: false, quando: null, voto: null, votoDiario: null, daVedere: false, piace: false, nota: null }
      dati.set(k, d)
    }
    return d
  }
  for (const v of e.visti) {
    const d = di(v.film)
    if (d) Object.assign(d, { visto: true, quando: piuRecente(d.quando, v.data) })
  }
  for (const v of e.voti) {
    const d = di(v.film)
    if (d) Object.assign(d, { visto: true, voto: v.voto })
  }
  for (const v of e.diario) {
    const d = di(v.film)
    if (!d) continue
    Object.assign(d, { visto: true, quando: piuRecente(d.quando, v.visto) })
    if (v.voto !== null && (!d.votoDiario || v.visto >= d.votoDiario.visto)) d.votoDiario = { voto: v.voto, visto: v.visto }
  }
  for (const v of e.watchlist) {
    const d = di(v.film)
    if (d) d.daVedere = true
  }
  // Su Letterboxd un «mi piace» segna il film come visto.
  for (const v of e.miPiace) {
    const d = di(v.film)
    if (d) Object.assign(d, { visto: true, piace: true })
  }
  for (const v of e.recensioni) {
    const d = di(v.film)
    if (d && (!d.nota || (v.visto ?? '') >= (d.nota.visto ?? ''))) Object.assign(d, { visto: true, nota: { testo: v.testo, visto: v.visto } })
  }

  const gia = new Map(esistenti.map((r) => [`${r.media_type}-${r.tmdb_id}`, r]))
  const conteggi = { visti: 0, daVedere: 0, voti: 0, preferiti: 0, note: 0, visioni: 0, liste: 0 }
  const titoli: RigaTitolo[] = []
  for (const [k, d] of dati) {
    if (!d.visto && !d.daVedere) continue // solo in una lista
    const ex = gia.get(k)
    const status = d.visto ? 'watched' : (ex?.status ?? 'to_watch')
    const voto = d.voto ?? d.votoDiario?.voto ?? null
    const riga: RigaTitolo = {
      user_id: userId,
      tmdb_id: d.item.id,
      media_type: d.item.mediaType,
      title: ex?.title ?? d.item.title,
      poster_path: ex?.poster_path ?? d.item.posterPath,
      genre_ids: ex?.genre_ids?.length ? ex.genre_ids : d.item.genreIds,
      status,
      is_favorite: (ex?.is_favorite ?? false) || d.piace,
      personal_rating: ex?.personal_rating ?? voto,
      notes: ex?.notes ?? d.nota?.testo ?? null,
      watched_at: ex?.watched_at ?? (d.visto ? d.quando : null),
      rewatch: ex?.rewatch ?? false,
    }
    const cambia =
      !ex ||
      ex.status !== riga.status ||
      ex.is_favorite !== riga.is_favorite ||
      ex.personal_rating !== riga.personal_rating ||
      ex.notes !== riga.notes ||
      ex.watched_at !== riga.watched_at
    if (!cambia) continue
    titoli.push(riga)
    if (riga.status === 'watched' && ex?.status !== 'watched') conteggi.visti++
    if (riga.status === 'to_watch' && !ex) conteggi.daVedere++
    if (riga.personal_rating !== null && ex?.personal_rating == null) conteggi.voti++
    if (riga.is_favorite && !ex?.is_favorite) conteggi.preferiti++
    if (riga.notes && !ex?.notes) conteggi.note++
  }

  // Le visioni del diario, una per film e giorno.
  const visioni = new Set(diarioEsistente.map((v) => `${v.media_type}-${v.tmdb_id}|${v.watched_on}`))
  const diario: RigaDiario[] = []
  for (const v of e.diario) {
    const item = titoloDi(v.film)
    if (!item) continue
    const k = `${chiave(item)}|${v.visto}`
    if (visioni.has(k)) continue
    visioni.add(k)
    const recensione = e.recensioni.find((r) => chiaveFilm(r.film) === chiaveFilm(v.film) && r.visto === v.visto)
    diario.push({
      user_id: userId,
      tmdb_id: item.id,
      media_type: item.mediaType,
      title: gia.get(chiave(item))?.title ?? item.title,
      poster_path: item.posterPath,
      watched_on: v.visto,
      rating: v.voto,
      note: recensione?.testo ?? null,
    })
  }
  conteggi.visioni = diario.length

  // Le liste: per nome, aggiungendo a quella che c'è già.
  const perNome = new Map(listeEsistenti.map((l) => [l.name.trim().toLowerCase(), l.id]))
  const liste = e.liste
    .map((l) => ({
      nome: l.nome,
      descrizione: l.descrizione,
      esistente: perNome.get(l.nome.trim().toLowerCase()) ?? null,
      titoli: [...new Map(l.film.flatMap((f) => (titoloDi(f) ? [titoloDi(f) as MediaItem] : [])).map((t) => [chiave(t), t])).values()],
    }))
    .filter((l) => l.titoli.length > 0)
  conteggi.liste = liste.length

  const nonTrovati = filmDellExport(e).filter((f) => abbinati.get(chiaveFilm(f)) === null)
  return { titoli, diario, liste, nonTrovati, conteggi }
}
