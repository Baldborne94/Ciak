// Le decisioni del lettore di Ciak quando qualcosa va storto, separate dalla
// pagina perché si possano provare senza un video vero.

// I guai del lettore che si dicono a chi guarda: un formato che il browser
// non legge, un video muto (audio Dolby), un salto o un avvio che non
// arrivano, la rete (il server di casa) che cade.
export type Problema = 'formato' | 'muto' | 'rete' | 'salto' | 'avvio'

// Riprese automatiche dopo un errore di rete, prima di dirlo.
export const TENTATIVI_MAX = 3

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

// Un salto che non finisce: il browser chiede il pezzo nuovo e, se non arriva
// (il server di casa che non risponde), resta in attesa senza mai dare
// errore. Dopo un po' lo si dice, invece di lasciare la rotellina.
const ATTESA_SALTO_MS = 20_000
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

// Il <video> che si lascia (episodio dopo, nuovo tentativo, uscita dal
// lettore). Tolto dalla pagina e basta, il browser continua a caricarlo: la
// richiesta resta aperta e su un tablet ruba banda e decodificatore
// all'episodio nuovo, che stentava a partire finché non si ricaricava la
// pagina. Senza `src` e ricaricato vuoto, il browser lo lascia andare davvero.
// Solo se è già fuori dalla pagina: React (in sviluppo) chiude e riapre gli
// effetti su un video che resta lì, e togliergli il file lo lasciava nero.
export function rilasciaVideo(
  v: Pick<HTMLVideoElement, 'isConnected' | 'pause' | 'removeAttribute' | 'load'> | null,
  suErrore: (e: unknown) => void = () => {},
): void {
  if (!v || v.isConnected) return
  try {
    v.pause()
    v.removeAttribute('src')
    v.load()
  } catch (e) {
    suErrore(e)
  }
}
