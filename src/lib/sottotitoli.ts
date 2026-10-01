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
  /\b(2160p|1080p|720p|576p|480p|4k|uhd|bluray|blu ray|brrip|bdrip|remux|web dl|webdl|webrip|hdtv|dvdrip|hdrip|x264|x265|h264|h265|h 264|h 265|hevc|avc|hdr|hdr10|10bit|ddp5 1|dd5 1|aac|ac3|proper|repack|extended|yify|yts|ita|eng)\b/i

// Il film (o l'episodio) da cercare online, dal nome del file o della cartella:
// «Song.of.the.Sea.2014.1080p.BluRay.x264.YIFY.mp4» → Song of the Sea, 2014;
// «Shogun.S01E01.Anjin.1080p.mkv» → Shogun, stagione 1, episodio 1.
export function analizzaNomeFilm(nome: string): NomeFilm {
  const s = nome
    .replace(ESTENSIONE_VIDEO, '')
    .replace(/[._]+/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  let fine = s.length
  const risultato: Omit<NomeFilm, 'titolo'> = {}

  const ep = /\bS(\d{1,2}) ?E(\d{1,3})\b/i.exec(s) ?? /\b(\d{1,2})x(\d{2,3})\b/.exec(s)
  if (ep) {
    risultato.stagione = Number(ep[1])
    risultato.episodio = Number(ep[2])
    fine = Math.min(fine, ep.index)
  }

  const etichetta = ETICHETTE.exec(s)
  if (etichetta && etichetta.index > 0) fine = Math.min(fine, etichetta.index)

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
export function stagioneDaCartella(nome: string | null | undefined): number | null {
  if (!nome) return null
  const m = /^\s*(?:season|stagione|series|serie|s)\s*[._-]?\s*(\d{1,2})(?!\d)/i.exec(nome)
  return m ? Number(m[1]) : null
}

// L'episodio di un file dentro una cartella di stagione, quando il nome non
// dice «S03E01»: «01 Rainforest Shmainforest», «E05», «Episodio 12».
function episodioDaNomeFile(nomeFile: string): number | undefined {
  const s = nomeFile.replace(ESTENSIONE_VIDEO, '').replace(/[._]+/g, ' ')
  const m =
    /^\s*(?:e|ep|episode|episodio)?\s*[-.]?\s*(\d{1,3})(?!\d)/i.exec(s) ??
    /\b(?:e|ep|episode|episodio)\s*[-.]?\s*(\d{1,3})(?!\d)/i.exec(s)
  return m ? Number(m[1]) : undefined
}

// Il nome del file dice di più (è lì che stanno stagione ed episodio); la
// cartella dedicata al film, se c'è, è spesso più pulita e porta l'anno.
// `serie` è la cartella sopra una cartella di stagione: «South Park/Season 03/
// 01 Rainforest Shmainforest.mp4» è South Park, stagione 3, episodio 1.
export function filmDaCercare(nomeFile: string, cartella: string | null, serie: string | null = null): NomeFilm {
  const daFile = analizzaNomeFilm(nomeFile)
  const stagione = stagioneDaCartella(cartella)
  if (serie && stagione !== null) {
    const daSerie = analizzaNomeFilm(serie)
    const episodio = daFile.episodio ?? episodioDaNomeFile(nomeFile)
    return {
      titolo: daSerie.titolo,
      ...(daSerie.anno !== undefined && { anno: daSerie.anno }),
      stagione: daFile.stagione ?? stagione,
      ...(episodio !== undefined && { episodio }),
    }
  }
  if (!cartella || daFile.anno !== undefined) return daFile
  if (daFile.stagione !== undefined) {
    // «S03E01.mp4» nella cartella della serie: il titolo è quello della cartella.
    const senzaTitolo = /^S\d{1,2} ?E\d{1,3}$/i.test(daFile.titolo) || /^\d{1,2}x\d{2,3}$/.test(daFile.titolo)
    return senzaTitolo ? { ...daFile, titolo: analizzaNomeFilm(cartella).titolo } : daFile
  }
  const daCartella = analizzaNomeFilm(cartella)
  return daCartella.anno !== undefined ? daCartella : daFile
}

// SRT → WebVTT. Cambia poco: l'intestazione, la virgola dei millesimi che
// diventa un punto, le ore sempre a due cifre. I tag di posizione in stile ASS
// («{\an8}») il browser li mostrerebbe come testo: via.
export function srtAVtt(testo: string): string {
  const pulito = testo
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .trim()
  if (/^WEBVTT/.test(pulito)) return `${pulito}\n`
  const corpo = pulito
    .replace(/(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})/g, (_m, h: string, m: string, sec: string, ms: string) =>
      `${h.padStart(2, '0')}:${m}:${sec}.${ms}`,
    )
    .replace(/\{\\[^}]*\}/g, '')
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
