// Le decisioni del lettore di Ciak quando qualcosa va storto, separate dalla
// pagina perché si possano provare senza un video vero.

export type Problema = 'formato' | 'muto' | 'sessione' | 'rete'

// I codici di MediaError: 2 è la rete, 3 la decodifica, 4 un formato che il
// browser non sa leggere.
const ERRORE_RETE = 2

export const TENTATIVI_MAX = 3

export interface StatoErrore {
  codice: number | undefined
  posizione: number // secondi già visti
  tentativi: number // riprese automatiche già fatte di fila
  connesso: boolean
}

// Cosa fare quando il <video> dà errore:
//  - sessione Google scaduta: ricollegarsi (nessun tentativo servirebbe);
//  - errore di rete, o qualunque errore a film già partito: riprendere da dove
//    si era. Il flusso passa dal service worker, che il browser può fermare a
//    metà film: la richiesta a Drive si chiude e il video si blocca, ma una
//    nuova richiesta lo risveglia;
//  - troppi tentativi di fila: dirlo, invece di girare a vuoto;
//  - errore prima ancora di partire: il browser non legge il file.
export function decidiErrore(s: StatoErrore): 'riprova' | Problema {
  if (!s.connesso) return 'sessione'
  const aMetaFilm = s.posizione > 0
  if (s.codice === ERRORE_RETE || aMetaFilm) return s.tentativi < TENTATIVI_MAX ? 'riprova' : 'rete'
  return 'formato'
}

// La sessione Google scade entro questo margine: meglio rinnovarla adesso, con
// un clic, che vedersi fermare il film a metà.
export const PREAVVISO_SESSIONE_MS = 10 * 60_000

export function sessioneInScadenza(scadenza: number, ora: number): boolean {
  return scadenza > 0 && scadenza - ora < PREAVVISO_SESSIONE_MS
}

// Il browser sta decodificando l'audio? Ogni motore lo espone a modo suo; null
// quando non si può sapere, e allora non si avvisa.
export function senzaAudio(v: HTMLVideoElement): boolean | null {
  const w = v as HTMLVideoElement & {
    webkitAudioDecodedByteCount?: number
    mozHasAudio?: boolean
    audioTracks?: { length: number }
  }
  if (typeof w.mozHasAudio === 'boolean') return !w.mozHasAudio
  if (typeof w.webkitAudioDecodedByteCount === 'number') return w.webkitAudioDecodedByteCount === 0
  if (w.audioTracks) return w.audioTracks.length === 0
  return null
}
