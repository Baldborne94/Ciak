// Logica pura dei sottotitoli del lettore di Ciak: riconoscere quali file di una
// cartella Drive sono i sottotitoli di un video, capire dal nome del file quale
// film cercare online, convertire l'SRT in WebVTT (l'unico formato che il
// browser accetta in un <track>) e calcolare l'hash di OpenSubtitles.

export type Lingua = 'it' | 'en'

export interface FileCartella {
  id: string
  name: string
  mimeType: string
}

export interface SottotitoloDrive {
  id: string
  name: string
  lingua: Lingua | null
}

const ESTENSIONE_VIDEO = /\.(mkv|mp4|m4v|avi|mov|webm|wmv|ts)$/i
const ESTENSIONE_SOTTOTITOLI = /\.(srt|vtt)$/i

// La lingua dal nome del file: «Film.it.srt», «Film [ITA].srt», «Film.English.srt».
export function linguaDaNome(nome: string): Lingua | null {
  const parole = nome
    .replace(ESTENSIONE_SOTTOTITOLI, '')
    .toLowerCase()
    .split(/[^a-z]+/)
  if (parole.some((p) => p === 'it' || p === 'ita' || p === 'italian' || p === 'italiano')) return 'it'
  if (parole.some((p) => p === 'en' || p === 'eng' || p === 'english' || p === 'inglese')) return 'en'
  return null
}

function radice(nome: string): string {
  return nome.replace(ESTENSIONE_VIDEO, '').toLowerCase()
}

const ORDINE_LINGUE: (Lingua | null)[] = ['it', 'en', null]

// I sottotitoli di un video fra i file della sua cartella. Vale quello che
// comincia col nome del video («B99 S7E2.it.srt» per «B99 S7E2.mp4»); se nella
// cartella c'è un solo video, ogni sottotitolo è suo — è il caso tipico della
// cartella dedicata a un film, dove l'.srt ha un nome tutto suo. Italiano prima.
export function sottotitoliPerVideo(nomeVideo: string, vicini: FileCartella[]): SottotitoloDrive[] {
  const unicoVideo = vicini.filter((f) => ESTENSIONE_VIDEO.test(f.name) || f.mimeType.startsWith('video/')).length <= 1
  const stem = radice(nomeVideo)
  return vicini
    .filter((f) => ESTENSIONE_SOTTOTITOLI.test(f.name))
    .filter((f) => unicoVideo || f.name.toLowerCase().startsWith(stem))
    .map((f) => ({ id: f.id, name: f.name, lingua: linguaDaNome(f.name) }))
    .sort(
      (a, b) =>
        ORDINE_LINGUE.indexOf(a.lingua) - ORDINE_LINGUE.indexOf(b.lingua) ||
        a.name.localeCompare(b.name, 'it', { numeric: true }),
    )
}

export interface NomeFilm {
  titolo: string
  anno?: number
  stagione?: number
  episodio?: number
}

// Ciò che nei nomi delle release viene dopo il titolo: qualità, sorgente, codec.
const ETICHETTE =
  /\b(2160p|1080p|720p|576p|480p|4k|uhd|bluray|blu ray|brrip|bdrip|remux|web dl|webdl|webrip|hdtv|dvdrip|hdrip|x264|x265|h264|h265|h 264|h 265|hevc|avc|hdr|hdr10|10bits?|8bits?|hi10p|ddp5 1|dd5 1|aac|ac3|proper|repack|extended|yify|yts|ita|eng)\b/i

// Le raccolte di stagioni nei nomi delle cartelle: «Season 1 to 26», «Seasons
// 1-9», «Stagioni 1-6», «The Complete Series», «S01-S05». Non sono il titolo:
// «South Park Season 1 to 26 Mp4 1080p» si cercava così, e non si trovava.
// (Qui i trattini sono già spazi.) Servono due numeri: «Hunting Season» resta.
const RACCOLTA =
  /\b(?:seasons? \d{1,2} (?:to |a )?\d{1,2}|stagion[ei] \d{1,2} (?:a |al )?\d{1,2}|(?:the )?complete series|serie completa|s\d{1,2} s\d{1,2})\b/i

// Il gruppo che ha preparato il file, in testa al nome degli anime:
// «[SubsPlease] Frieren - 05», «[a-S] Samurai Champloo (01-26)».
const GRUPPO = /^\s*\[[^\]]*\]\s*/
// Il numero dell'episodio fra due trattini, come lo scrivono gli anime
// («titolo - 26 - nome dell'episodio», «titolo - 05 (1080p)», «- 01v2»). Al più
// tre cifre, e almeno due (gli anime scrivono «05»): «Blade Runner - 2049» e
// «Rocky - 2» non sono episodi.
// Con la parola davanti («- Episode 05 -», «- Ep 7 -») basta anche una cifra.
const EPISODIO_ANIME = /\s-\s(?:(?:episode|episodio|ep)\.?\s*(\d{1,3})|(\d{2,3}))(?:v\d)?(?=\s+-\s|\s*[[(]|\s*$)/i
// Senza trattini, come i nomi coi trattini bassi
// («[asaadas]Fullmetal_Alchemist_Brotherhood_17v2_[BD_720p]…»): il numero
// subito prima delle etichette fra quadre. Solo se il nome comincia col gruppo,
// il segno che è un anime: «Apollo 13 [1080p]» è un film.
const EPISODIO_ANIME_NUDO = /\s(\d{2,3})(?:v\d)?(?=\s*\[)/
// Gli episodi contenuti in una cartella: «(01-26)», «[01-26]». (Qui i
// trattini sono già spazi.)
const INTERVALLO = /[([]\d{1,3} \d{1,3}[)\]]/

// Il film (o l'episodio) da cercare online, dal nome del file o della cartella:
// «Song.of.the.Sea.2014.1080p.BluRay.x264.YIFY.mp4» → Song of the Sea, 2014;
// «Shogun.S01E01.Anjin.1080p.mkv» → Shogun, stagione 1, episodio 1.
export function analizzaNomeFilm(nome: string): NomeFilm {
  const letto = leggiNome(nome)
  delete letto.anime
  return letto
}

// Come `analizzaNomeFilm`, e in più se la stagione è solo quella supposta
// per gli anime (che il nome non dice).
function leggiNome(nome: string): NomeFilm & { anime?: true } {
  const senzaEstensione = nome.replace(ESTENSIONE_VIDEO, '').replace(/_/g, ' ')
  const conGruppo = GRUPPO.test(senzaEstensione)
  const senzaGruppo = senzaEstensione.replace(GRUPPO, '')
  if (!/\bS\d{1,2} ?E\d{1,3}\b/i.test(senzaGruppo)) {
    // Gli anime contano gli episodi di fila, senza stagione: su TMDB la
    // maggior parte sta nella stagione 1. Il titolo è ciò che viene prima.
    const anime = EPISODIO_ANIME.exec(senzaGruppo) ?? (conGruppo ? EPISODIO_ANIME_NUDO.exec(senzaGruppo) : null)
    if (anime && anime.index > 0) {
      const { titolo, anno } = analizzaNomeFilm(senzaGruppo.slice(0, anime.index))
      return { titolo, ...(anno !== undefined && { anno }), stagione: 1, episodio: Number(anime[1] ?? anime[2]), anime: true }
    }
  }
  const s = senzaGruppo
    .replace(/[._]+/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  let fine = s.length
  const risultato: Omit<NomeFilm, 'titolo'> = {}

  const ep = /\bS(\d{1,2}) ?E(\d{1,3})\b/i.exec(s) ?? /\b(\d{1,2})x(\d{2,3})\b/.exec(s)
  // Gli speciali degli anime: «OADE01», «OVA 3», «Special 1». Su TMDB sono la
  // stagione 0, ed è lì che si spuntano.
  const speciale = ep ? null : /\b(?:OAD|OVA|ONA|Special|Speciale)\s*E?\s*(\d{1,3})\b/i.exec(s)
  if (ep && (mezzoEpisodio(nome) || Number(ep[2]) === 0)) {
    // «S01E13.5» è un riassunto fra due episodi: su TMDB sta fra gli speciali,
    // con un numero che dal nome non si ricava. Leggerlo come E13 ne faceva
    // un secondo episodio 13. Lo stesso per l'episodio 0 («S04E00»), che su
    // TMDB non esiste: è uno speciale.
    risultato.stagione = 0
    fine = Math.min(fine, ep.index)
  } else if (ep) {
    risultato.stagione = Number(ep[1])
    risultato.episodio = Number(ep[2])
    fine = Math.min(fine, ep.index)
  } else if (speciale) {
    risultato.stagione = 0
    risultato.episodio = Number(speciale[1])
    fine = Math.min(fine, speciale.index)
  }

  const etichetta = ETICHETTE.exec(s)
  if (etichetta && etichetta.index > 0) fine = Math.min(fine, etichetta.index)
  const raccolta = RACCOLTA.exec(s)
  if (raccolta && raccolta.index > 0) fine = Math.min(fine, raccolta.index)
  const intervallo = INTERVALLO.exec(s)
  if (intervallo && intervallo.index > 0) fine = Math.min(fine, intervallo.index)

  // L'anno è l'ULTIMO prima delle etichette, e mai la prima parola: «Blade
  // Runner 2049 (2017)» è del 2017, «2001 Odissea nello spazio 1968» del 1968.
  let anno: RegExpMatchArray | undefined
  for (const m of s.matchAll(/[([]?\b((?:19|20)\d{2})\b[)\]]?/g)) {
    if (m.index !== undefined && m.index > 0 && m.index < fine) anno = m
  }
  if (anno?.index !== undefined) {
    risultato.anno = Number(anno[1])
    fine = anno.index
  }

  const titolo = s
    .slice(0, fine)
    .replace(/[\s([\]-]+$/, '')
    .trim()
  return { titolo: titolo || s, ...risultato }
}

// Una cartella di stagione: «Season 03», «Stagione 2», «S01», «Series 7».
// Subito dopo la parola ci vuole il numero: «Serie TV», «Supernatural» o
// «Se7en» non sono stagioni.
// Gli speciali (OAD, OVA, extra) sono la stagione 0, come su TMDB.
export function stagioneDaCartella(nome: string | null | undefined): number | null {
  if (!nome) return null
  const m = /^\s*(?:season|stagione|series|serie|s)\s*[._-]?\s*(\d{1,2})(?!\d)/i.exec(nome)
  if (m) return Number(m[1])
  if (/^\s*(?:OADs?|OVAs?|ONAs?|Specials?|Speciali|Extras?)\s*$/i.test(nome)) return 0
  return specialeScrittoMale(nome) ? 0 : null
}

// «Speicals», «Specail»: le lettere giuste in un ordine sbagliato. Basta una
// parola sola, che cominci per «s»: «Special Forces» resta un titolo.
function specialeScrittoMale(nome: string): boolean {
  const parola = nome.trim().toLowerCase()
  if (!/^s[a-z]+$/.test(parola)) return false
  const lettere = (p: string) => [...p].sort().join('')
  return ['special', 'specials', 'speciali'].some((giusta) => lettere(giusta) === lettere(parola))
}

// «S01E13.5» o, in una cartella di stagione, «13.5 Since That Day». Si guarda
// il nome com'è, prima che i punti diventino spazi: «S01E13 - 5 cose» non lo
// è, e nemmeno «S01E13.720p» (dopo la cifra non c'è uno stacco).
function mezzoEpisodio(nomeFile: string): boolean {
  const s = nomeFile.replace(ESTENSIONE_VIDEO, '')
  return /\bS\d{1,2} ?E\d{1,3}[.,]\d\b/i.test(s) || /^\s*(?:e|ep|episode|episodio)?\s*[-.]?\s*\d{1,3}[.,]\d\b/i.test(s)
}

// Un «titolo» che è solo il segno dell'episodio: «S03E01.mp4», «OVA 3.mkv».
function soloEpisodio(titolo: string): boolean {
  return /^(?:S\d{1,2} ?E\d{1,3}|\d{1,2}x\d{2,3}|(?:OAD|OVA|ONA|Special|Speciale)\s*E?\s*\d{1,3})\b/i.test(titolo)
}

// L'episodio di un file dentro una cartella di stagione, quando il nome non
// dice «S03E01»: «01 Rainforest Shmainforest», «E05», «Episodio 12».
function episodioDaNomeFile(nomeFile: string): number | undefined {
  const s = nomeFile.replace(ESTENSIONE_VIDEO, '').replace(/[._]+/g, ' ')
  const m =
    /^\s*(?:e|ep|episode|episodio)?\s*[-.]?\s*(\d{1,3})(?!\d)/i.exec(s) ??
    /\b(?:e|ep|episode|episodio|OAD|OVA|ONA|special|speciale)\s*[-.]?\s*E?\s*(\d{1,3})(?!\d)/i.exec(s)
  return m ? Number(m[1]) : undefined
}

// Il nome del file dice di più (è lì che stanno stagione ed episodio); la
// cartella dedicata al film, se c'è, è spesso più pulita e porta l'anno.
// `serie` è la cartella sopra una cartella di stagione: «South Park/Season 03/
// 01 Rainforest Shmainforest.mp4» è South Park, stagione 3, episodio 1.
export function filmDaCercare(nomeFile: string, cartella: string | null, serie: string | null = null): NomeFilm {
  const { anime, ...daFile } = leggiNome(nomeFile)
  const stagione = stagioneDaCartella(cartella)
  if (serie && stagione !== null) {
    const daSerie = analizzaNomeFilm(serie)
    // Senza numero: un mezzo episodio, o uno speciale che il file chiama
    // episodio 0 («S04E00»).
    const mezzo = mezzoEpisodio(nomeFile) || (daFile.stagione === 0 && daFile.episodio === undefined)
    const episodio = mezzo ? undefined : (daFile.episodio ?? episodioDaNomeFile(nomeFile))
    // «South Park S03E06.mp4» dice da sé di che serie è, ed è più affidabile
    // della cartella sopra, che può essere una raccolta col nome della release.
    const dalFile = daFile.stagione !== undefined && !soloEpisodio(daFile.titolo)
    const anno = dalFile ? (daFile.anno ?? daSerie.anno) : daSerie.anno
    return {
      titolo: dalFile ? daFile.titolo : daSerie.titolo,
      ...(anno !== undefined && { anno }),
      // La stagione 1 supposta per un anime («titolo - 05») non vale quella
      // della cartella.
      stagione: mezzo ? 0 : anime ? stagione : (daFile.stagione ?? stagione),
      ...(episodio !== undefined && { episodio }),
    }
  }
  if (!cartella || daFile.anno !== undefined) return daFile
  if (daFile.stagione !== undefined) {
    // «S03E01.mp4» nella cartella della serie: il titolo è quello della cartella.
    return soloEpisodio(daFile.titolo) ? { ...daFile, titolo: analizzaNomeFilm(cartella).titolo } : daFile
  }
  const daCartella = analizzaNomeFilm(cartella)
  return daCartella.anno !== undefined ? daCartella : daFile
}

// La posizione di una battuta in stile ASS, come la scrive ffmpeg estraendo i
// sottotitoli dagli MKV: «{\an8}» è in alto al centro (il tastierino: 7 8 9 in
// alto, 4 5 6 a metà, 1 2 3 in basso). Diventa l'impostazione «line» di
// WebVTT: le scritte a schermo tradotte (cartelli, insegne) vanno in alto,
// dove i fansub le mettono, e non coprono i dialoghi in basso.
function lineaDaAss(testo: string): string | null {
  const m = /\{\\[^}]*\ban([1-9])/.exec(testo)
  if (!m) return null
  const n = Number(m[1])
  return n >= 7 ? 'line:0' : n >= 4 ? 'line:50%' : null
}

// SRT → WebVTT. Cambia poco: l'intestazione, la virgola dei millesimi che
// diventa un punto, le ore sempre a due cifre. I tag in stile ASS («{\an8}»)
// si tolgono dal testo, ma la posizione che dicono resta (vedi lineaDaAss).
export function srtAVtt(testo: string): string {
  const pulito = testo
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .trim()
  if (/^WEBVTT/.test(pulito)) return `${pulito}\n`
  const corpo = pulito
    .split(/\n{2,}/)
    .map((blocco) => {
      const righe = blocco
        .replace(/(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})/g, (_m, h: string, m: string, sec: string, ms: string) =>
          `${h.padStart(2, '0')}:${m}:${sec}.${ms}`,
        )
        .split('\n')
      const linea = lineaDaAss(blocco)
      const tempi = righe.findIndex((r) => r.includes('-->'))
      if (linea && tempi >= 0) righe[tempi] = `${righe[tempi]} ${linea}`
      return righe.join('\n').replace(/\{\\[^}]*\}/g, '')
    })
    .join('\n\n')
  return `WEBVTT\n\n${corpo}\n`
}

// I sottotitoli italiani girano spesso in Windows-1252 invece che in UTF-8:
// letti come UTF-8, «è» diventerebbe «�». Si prova UTF-8 in modo rigoroso e si
// ripiega sulla codifica occidentale di Windows.
export function decodificaTesto(byte: ArrayBuffer | Uint8Array): string {
  const u8 = byte instanceof Uint8Array ? byte : new Uint8Array(byte)
  if (u8[0] === 0xff && u8[1] === 0xfe) return new TextDecoder('utf-16le').decode(u8)
  if (u8[0] === 0xfe && u8[1] === 0xff) return new TextDecoder('utf-16be').decode(u8)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(u8)
  } catch {
    return new TextDecoder('windows-1252').decode(u8)
  }
}

// L'hash di OpenSubtitles identifica una release precisa: dimensione del file
// più la somma, a parole di 64 bit little-endian, dei primi e degli ultimi 64 KB.
// Col suo aiuto si trovano sottotitoli già sincronizzati su quel file.
export const BLOCCO_HASH = 65536
const MASCHERA_64 = (BigInt(1) << BigInt(64)) - BigInt(1)

export function hashOpenSubtitles(dimensione: number, inizio: ArrayBuffer, fine: ArrayBuffer): string {
  let hash = BigInt(dimensione)
  for (const blocco of [inizio, fine]) {
    const vista = new DataView(blocco)
    for (let i = 0; i + 8 <= vista.byteLength; i += 8) {
      hash = (hash + vista.getBigUint64(i, true)) & MASCHERA_64
    }
  }
  return hash.toString(16).padStart(16, '0')
}

export function nomeLingua(lingua: string | null): string {
  if (lingua === 'it') return 'Italiano'
  if (lingua === 'en') return 'Inglese'
  return 'Sottotitoli'
}

// Il nome con cui si salva nella cartella un sottotitolo scaricato: accanto al
// video e col suo nome, così la volta dopo si trova da solo.
export function nomeSottotitoloSalvato(nomeVideo: string, lingua: string | null): string {
  const base = nomeVideo.replace(ESTENSIONE_VIDEO, '')
  return lingua ? `${base}.${lingua}.srt` : `${base}.srt`
}
