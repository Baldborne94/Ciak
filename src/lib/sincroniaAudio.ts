// Un <audio> che segue un <video>: la lingua scelta dal menu Audio, quando non
// è quella dentro il film (vedi tracceAudio.ts). Il video comanda: play,
// pausa, salti e velocità passano all'audio; il video tace, e il volume che
// si regola diventa quello dell'audio.
//
// Due elementi separati si allontanano un po' alla volta (e di colpo dopo
// un'attesa di rete): a ogni timeupdate si confrontano, e oltre la soglia
// l'audio si riporta al punto del video. Non più di una volta ogni tanto,
// perché un audio che sta ancora caricando, spostato di continuo, non
// riparte mai.

export const SCARTO_MASSIMO = 0.3 // secondi: oltre, le labbra si vedono fuori sincrono
export const PAUSA_CORREZIONI_MS = 1500

// Il minimo di <video> e <audio> che serve: così si prova con oggetti finti.
export interface ElementoMedia extends EventTarget {
  currentTime: number
  paused: boolean
  playbackRate: number
  muted: boolean
  volume: number
  play(): Promise<void>
  pause(): void
}

export function collegaAudio(
  video: ElementoMedia,
  audio: ElementoMedia,
  errore: (e: unknown) => void,
  ora: () => number = Date.now,
): () => void {
  let ultimaCorrezione = -Infinity

  // Il volume scelto finora era quello del video: passa all'audio.
  audio.volume = video.volume
  audio.muted = video.muted
  video.muted = true
  audio.playbackRate = video.playbackRate

  const allinea = () => {
    audio.currentTime = video.currentTime
    ultimaCorrezione = ora()
  }
  const suona = () => {
    if (video.paused) return
    allinea()
    if (audio.paused) audio.play().catch(errore)
  }
  const ferma = () => {
    if (!audio.paused) audio.pause()
  }
  const controlla = () => {
    if (video.paused || audio.paused) return
    if (Math.abs(audio.currentTime - video.currentTime) <= SCARTO_MASSIMO) return
    if (ora() - ultimaCorrezione < PAUSA_CORREZIONI_MS) return
    allinea()
  }
  const velocita = () => {
    audio.playbackRate = video.playbackRate
  }
  // Fermo davanti a un salto o a un'attesa di rete; riparte con lui.
  const ascolti: [string, () => void][] = [
    ['playing', suona],
    ['play', suona],
    ['seeked', suona],
    ['pause', ferma],
    ['waiting', ferma],
    ['seeking', ferma],
    ['ended', ferma],
    ['emptied', ferma],
    ['timeupdate', controlla],
    ['ratechange', velocita],
  ]
  ascolti.forEach(([e, f]) => video.addEventListener(e, f))
  suona()

  return () => {
    ascolti.forEach(([e, f]) => video.removeEventListener(e, f))
    ferma()
    // Si torna alla traccia del video, col volume che si aveva.
    video.volume = audio.volume
    video.muted = audio.muted
  }
}
