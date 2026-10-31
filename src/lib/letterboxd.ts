import { unzipSync, strFromU8 } from 'fflate'

// L'esportazione di Letterboxd (letterboxd.com → Settings → Import & Export →
// Export your data): uno ZIP di CSV. Qui si legge, senza rete: cosa hai visto,
// i voti, il diario, la watchlist, i «mi piace», le recensioni e le liste.
// Letterboxd non ha un'API pubblica: il file che ti dà è l'unico modo onesto
// di portarsi dietro i propri dati.

export interface FilmLetterboxd {
  nome: string
  anno: number | null
}

export interface ExportLetterboxd {
  visti: { film: FilmLetterboxd; data: string | null }[]
  voti: { film: FilmLetterboxd; voto: number; data: string | null }[]
  diario: { film: FilmLetterboxd; visto: string; voto: number | null; rivisto: boolean }[]
  watchlist: { film: FilmLetterboxd; data: string | null }[]
  miPiace: { film: FilmLetterboxd }[]
  recensioni: { film: FilmLetterboxd; testo: string; visto: string | null }[]
  liste: { nome: string; descrizione: string | null; film: FilmLetterboxd[] }[]
}

// La stessa pellicola nei vari file: per nome e anno.
export function chiaveFilm(f: FilmLetterboxd): string {
  return `${f.nome.trim().toLowerCase()}|${f.anno ?? ''}`
}

// CSV come lo scrive Letterboxd: virgolette per i campi con virgole o a capo
// (le recensioni), "" per una virgoletta dentro un campo.
export function leggiCsv(testo: string): string[][] {
  const righe: string[][] = []
  let riga: string[] = []
  let campo = ''
  let tra = false
  for (let i = 0; i < testo.length; i++) {
    const c = testo[i]
    if (tra) {
      if (c === '"' && testo[i + 1] === '"') {
        campo += '"'
        i++
      } else if (c === '"') tra = false
      else campo += c
    } else if (c === '"') tra = true
    else if (c === ',') {
      riga.push(campo)
      campo = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && testo[i + 1] === '\n') i++
      riga.push(campo)
      righe.push(riga)
      riga = []
      campo = ''
    } else campo += c
  }
  if (campo !== '' || riga.length > 0) {
    riga.push(campo)
    righe.push(riga)
  }
  return righe
}

// Le righe di una tabella come oggetti, per nome di colonna.
function tabella(righe: string[][]): Record<string, string>[] {
  const [intestazione, ...resto] = righe
  if (!intestazione) return []
  return resto
    .filter((r) => r.some((c) => c.trim() !== ''))
    .map((r) => Object.fromEntries(intestazione.map((nome, i) => [nome.trim(), (r[i] ?? '').trim()])))
}

const film = (r: Record<string, string>): FilmLetterboxd => ({ nome: r['Name'], anno: /^\d{4}$/.test(r['Year'] ?? '') ? Number(r['Year']) : null })
const voto = (v: string | undefined) => {
  const n = Number(v)
  return v && n > 0 && n <= 5 ? n : null
}
const data = (v: string | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)

// Un file di lista: due tabelle una sotto l'altra, separate da una riga vuota:
// prima la lista (nome, descrizione), poi i suoi film.
function leggiLista(testo: string): ExportLetterboxd['liste'][number] | null {
  const righe = leggiCsv(testo)
  const inizioFilm = righe.findIndex((r) => r[0] === 'Position' && r.includes('Name'))
  const inizioLista = righe.findIndex((r) => r[0] === 'Date' && r.includes('Name'))
  if (inizioFilm < 0 || inizioLista < 0 || inizioLista > inizioFilm) return null
  const [lista] = tabella(righe.slice(inizioLista, inizioFilm))
  if (!lista?.['Name']) return null
  return {
    nome: lista['Name'],
    descrizione: lista['Description'] || null,
    film: tabella(righe.slice(inizioFilm)).filter((r) => r['Name']).map(film),
  }
}

export function leggiExport(file: Map<string, string>): ExportLetterboxd {
  // Il nome senza cartelle intermedie («letterboxd-utente-2026/watched.csv»
  // diventa «watched.csv»), e mai le cartelle dei cancellati.
  const perNome = new Map<string, string>()
  for (const [percorso, testo] of file) {
    const parti = percorso.replace(/\\/g, '/').split('/').filter(Boolean)
    if (parti.some((p) => /^(deleted|orphaned)$/i.test(p))) continue
    const ultimi = parti.slice(-2).join('/').toLowerCase()
    perNome.set(/^(likes|lists)\//.test(ultimi) ? ultimi : parti[parti.length - 1].toLowerCase(), testo)
  }
  const di = (nome: string) => tabella(leggiCsv(perNome.get(nome) ?? '')).filter((r) => r['Name'])
  return {
    visti: di('watched.csv').map((r) => ({ film: film(r), data: data(r['Date']) })),
    voti: di('ratings.csv').flatMap((r) => (voto(r['Rating']) ? [{ film: film(r), voto: voto(r['Rating']) as number, data: data(r['Date']) }] : [])),
    diario: di('diary.csv').flatMap((r) => {
      const visto = data(r['Watched Date']) ?? data(r['Date'])
      return visto ? [{ film: film(r), visto, voto: voto(r['Rating']), rivisto: r['Rewatch'] === 'Yes' }] : []
    }),
    watchlist: di('watchlist.csv').map((r) => ({ film: film(r), data: data(r['Date']) })),
    miPiace: di('likes/films.csv').map((r) => ({ film: film(r) })),
    recensioni: di('reviews.csv')
      .filter((r) => r['Review'])
      .map((r) => ({ film: film(r), testo: r['Review'], visto: data(r['Watched Date']) ?? data(r['Date']) })),
    liste: [...perNome]
      .filter(([nome]) => nome.startsWith('lists/'))
      .flatMap(([, testo]) => leggiLista(testo) ?? []),
  }
}

// I file scelti: lo ZIP com'è, o i CSV già estratti.
export async function fileDaScelta(scelti: File[]): Promise<Map<string, string>> {
  const fuori = new Map<string, string>()
  for (const f of scelti) {
    if (/\.zip$/i.test(f.name)) {
      const dentro = unzipSync(new Uint8Array(await f.arrayBuffer()), { filter: (x) => /\.csv$/i.test(x.name) })
      for (const [nome, byte] of Object.entries(dentro)) fuori.set(nome, strFromU8(byte))
    } else if (/\.csv$/i.test(f.name)) {
      fuori.set(f.webkitRelativePath || f.name, await f.text())
    }
  }
  return fuori
}

// Tutti i film nominati nell'esportazione, una volta sola.
export function filmDellExport(e: ExportLetterboxd): FilmLetterboxd[] {
  const tutti = new Map<string, FilmLetterboxd>()
  const metti = (f: FilmLetterboxd) => tutti.set(chiaveFilm(f), f)
  for (const v of [...e.visti, ...e.voti, ...e.diario, ...e.watchlist, ...e.miPiace, ...e.recensioni]) metti(v.film)
  for (const l of e.liste) l.film.forEach(metti)
  return [...tutti.values()]
}
