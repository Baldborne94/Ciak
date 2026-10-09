import type { FileCartella } from './sottotitoli'

// Le lingue dell'audio di un video su Drive. Chrome e Firefox di un MP4 suonano
// solo la prima traccia: le altre, prepara-ciak le salva accanto al video
// («Film.audio-2.m4a») con l'elenco di tutte («Film.audio.json»), e il lettore
// le suona da un <audio> tenuto al passo col video (vedi sincroniaAudio.ts).
// Logica pura, provata senza rete.

export interface TracciaAudio {
  indice: number // 1 è quella dentro il video
  lingua: string | null // 'it', 'en', o il codice del file ('jpn')
  titolo: string
  fileId: string | null // il .m4a su Drive; null per quella dentro il video
}

const ESTENSIONE_VIDEO = /\.(mkv|mp4|m4v|avi|mov|webm|wmv|ts)$/i

function base(nomeVideo: string): string {
  return nomeVideo.replace(ESTENSIONE_VIDEO, '')
}

export function nomeElencoAudio(nomeVideo: string): string {
  return `${base(nomeVideo)}.audio.json`
}

// I file delle lingue di un video fra quelli della sua cartella: l'elenco e i
// .m4a. Vanno nel cestino col video, altrimenti restano orfani su Drive.
export function fileAudioDelVideo(nomeVideo: string, vicini: FileCartella[]): FileCartella[] {
  const b = base(nomeVideo)
  const suo = new RegExp(`^${b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.audio(-\\d+\\.m4a|\\.json)$`)
  return vicini.filter((f) => suo.test(f.name))
}

interface ElencoGrezzo {
  tracce?: { indice?: unknown; lingua?: unknown; titolo?: unknown; file?: unknown }[]
}

// L'elenco scritto dallo script, con i file risolti negli id di Drive. Una
// traccia il cui .m4a manca (caricamento non finito, cancellato a mano) non si
// offre: sceglierla vorrebbe dire silenzio. Con una lingua sola non c'è niente
// da scegliere, e torna vuoto.
export function leggiElencoAudio(testo: string, vicini: FileCartella[]): TracciaAudio[] {
  let dati: ElencoGrezzo
  try {
    // Un BOM davanti (un file riscritto a mano col Blocco note) JSON.parse non lo accetta.
    dati = JSON.parse(testo.replace(/^\uFEFF/, '')) as ElencoGrezzo
  } catch {
    return []
  }
  if (!Array.isArray(dati?.tracce)) return []
  const perNome = new Map(vicini.map((f) => [f.name, f.id]))
  const tracce: TracciaAudio[] = []
  dati.tracce.forEach((t, i) => {
    const indice = typeof t.indice === 'number' ? t.indice : i + 1
    const lingua = typeof t.lingua === 'string' && t.lingua ? t.lingua.toLowerCase() : null
    const titolo = typeof t.titolo === 'string' ? t.titolo : ''
    if (typeof t.file === 'string' && t.file) {
      const fileId = perNome.get(t.file)
      if (fileId) tracce.push({ indice, lingua, titolo, fileId })
    } else if (i === 0) {
      tracce.push({ indice, lingua, titolo, fileId: null })
    }
  })
  return tracce.length > 1 && tracce[0].fileId === null ? tracce : []
}

// I codici delle lingue, sia a due lettere sia a tre (ISO 639-2, quello dei
// file video: «jpn», e per qualche lingua due varianti, «ger» e «deu»).
const LINGUE: Record<string, string> = {
  it: 'Italiano', ita: 'Italiano',
  en: 'Inglese', eng: 'Inglese',
  ja: 'Giapponese', jpn: 'Giapponese',
  fr: 'Francese', fre: 'Francese', fra: 'Francese',
  de: 'Tedesco', ger: 'Tedesco', deu: 'Tedesco',
  es: 'Spagnolo', spa: 'Spagnolo',
  pt: 'Portoghese', por: 'Portoghese',
  ru: 'Russo', rus: 'Russo',
  zh: 'Cinese', chi: 'Cinese', zho: 'Cinese',
  ko: 'Coreano', kor: 'Coreano',
  hi: 'Hindi', hin: 'Hindi',
  ar: 'Arabo', ara: 'Arabo',
  nl: 'Olandese', dut: 'Olandese', nld: 'Olandese',
  sv: 'Svedese', swe: 'Svedese',
  da: 'Danese', dan: 'Danese',
  no: 'Norvegese', nor: 'Norvegese',
  fi: 'Finlandese', fin: 'Finlandese',
  pl: 'Polacco', pol: 'Polacco',
  tr: 'Turco', tur: 'Turco',
  el: 'Greco', gre: 'Greco', ell: 'Greco',
  he: 'Ebraico', heb: 'Ebraico',
  th: 'Thailandese', tha: 'Thailandese',
  hu: 'Ungherese', hun: 'Ungherese',
  cs: 'Ceco', cze: 'Ceco', ces: 'Ceco',
}

export function nomeLinguaAudio(lingua: string | null): string | null {
  if (!lingua) return null
  return LINGUE[lingua.toLowerCase()] ?? lingua.toUpperCase()
}

// I nomi delle voci del menu. Una lingua che si ripete (il commento del
// regista, una seconda traccia italiana) si distingue col titolo che le ha dato
// chi ha fatto il file, o col numero; una traccia senza lingua è «Traccia N».
export function nomiTracceAudio(tracce: TracciaAudio[]): string[] {
  const nomi = tracce.map((t) => nomeLinguaAudio(t.lingua))
  return tracce.map((t, i) => {
    const nome = nomi[i]
    if (!nome) return t.titolo ? `Traccia ${t.indice} · ${t.titolo}` : `Traccia ${t.indice}`
    const ripetuta = nomi.filter((n) => n === nome).length > 1
    if (!ripetuta) return nome
    return t.titolo ? `${nome} · ${t.titolo}` : `${nome} ${t.indice}`
  })
}

// La sigla sul pulsante: «IT», «JA»… o il numero della traccia.
export function siglaTracciaAudio(t: TracciaAudio | undefined): string {
  if (!t) return ''
  if (!t.lingua) return String(t.indice)
  const due = Object.entries(LINGUE).find(([codice, nome]) => codice.length === 2 && nome === LINGUE[t.lingua!])
  return (due?.[0] ?? t.lingua.slice(0, 2)).toUpperCase()
}

// ── La scelta, ricordata ────────────────────────────────────────────────────
// Si ricorda la lingua, non la posizione: in un episodio l'italiano è la
// seconda traccia, nel successivo potrebbe essere la terza. Per serie, perché
// un anime si guarda doppiato e un altro in originale; per i film una scelta
// sola, che è il gusto di chi guarda.

const CHIAVE = 'ciak:audio:'

export function leggiLinguaAudio(ambito: string): string | null {
  try {
    return localStorage.getItem(CHIAVE + ambito) || null
  } catch {
    return null
  }
}

export function salvaLinguaAudio(ambito: string, lingua: string | null): void {
  try {
    if (lingua) localStorage.setItem(CHIAVE + ambito, lingua)
    else localStorage.removeItem(CHIAVE + ambito)
  } catch {
    /* storage negato: la prossima volta si riparte dalla prima traccia */
  }
}

// La traccia con la lingua ricordata; la prima (quella del video) se manca.
// «ita» e «it» sono la stessa lingua: si confrontano i nomi.
export function indiceAudio(tracce: TracciaAudio[], lingua: string | null): number {
  if (!lingua) return 0
  const nome = nomeLinguaAudio(lingua)
  const i = tracce.findIndex((t) => nomeLinguaAudio(t.lingua) === nome)
  return i < 0 ? 0 : i
}
