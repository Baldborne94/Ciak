// Le decisioni del lettore di Ciak quando qualcosa va storto, separate dalla
// pagina perché si possano provare senza un video vero.

export type Problema = 'formato' | 'muto' | 'sessione' | 'rete' | 'salto' | 'avvio'

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

// Cosa ha risposto Drive a un pezzo di film, come lo racconta il service worker.
export interface DiagnosticaVideo {
  quando: number
  ms: number
  range: string | null
  status: number
  redirect: string | null
  contentLength: string | null
  totale: number | null
  esito: 'ok' | 'errore' | 'range-ignorato' | 'rifiutata' | 'dispositivo'
  // Solo per «rifiutata»: il messaggio del browser.
  errore?: string
}

// Una riga per il pannello «Dettagli tecnici»: quello che serve a capire da
// uno screenshot perché un salto avanti non funziona.
export function descriviDiagnostica(d: DiagnosticaVideo): string {
  const ora = new Date(d.quando).toLocaleTimeString('it-IT')
  const chiesto = d.range ? `chiesto ${d.range}` : 'chiesto tutto il file'
  if (d.esito === 'dispositivo') {
    return `${ora} · ${chiesto} → servito dal film scaricato sul dispositivo${d.totale ? ` (${d.totale} byte)` : ''}`
  }
  const esito =
    d.esito === 'rifiutata'
      ? `il browser ha rifiutato la richiesta a Drive${d.errore ? ` (${d.errore})` : ''}`
      : d.esito === 'range-ignorato'
      ? 'Drive ha ignorato il Range e ha mandato tutto il file'
      : d.esito === 'errore'
        ? `Drive ha risposto ${d.status}`
        : `Drive ha risposto ${d.status}${d.contentLength ? `, ${d.contentLength} byte` : ''}`
  const extra = [
    d.totale ? `file di ${d.totale} byte` : 'dimensione del file sconosciuta',
    d.redirect ? `reindirizzato a ${d.redirect}` : null,
    `${d.ms} ms`,
  ].filter(Boolean)
  return `${ora} · ${chiesto} → ${esito} (${extra.join(', ')})`
}

// Un salto che non finisce: il browser chiede il pezzo nuovo e, se non arriva
// (Drive che ignora il Range, worker fermato a metà), resta in attesa senza
// mai dare errore. Dopo un po' lo si dice, invece di lasciare la rotellina.
export const ATTESA_SALTO_MS = 20_000
// Un film che non parte: alcuni MKV il browser li scarica senza mai riuscire
// ad aprirli, e senza dare errore. Oltre questa attesa lo si dice.
export const ATTESA_AVVIO_MS = 20_000

export function vigilanzaSalto(suBlocco: () => void, attesaMs = ATTESA_SALTO_MS) {
  let timer: ReturnType<typeof setTimeout> | null = null
  const ferma = () => {
    if (timer) clearTimeout(timer)
    timer = null
  }
  return {
    inizio() {
      ferma()
      timer = setTimeout(() => {
        timer = null
        suBlocco()
      }, attesaMs)
    },
    fine: ferma,
  }
}
