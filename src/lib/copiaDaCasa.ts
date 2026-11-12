import { salvaRispostaSulDispositivo, type SottotitoloOffline } from './filmOffline'
import { ErroreJellyfin, fermaConversione, flussoDiretto, flussoMp4, riproducibileDirettamente, tracciaPredefinita, type InfoJellyfin } from './jellyfin'

// «Salva in Ciak» per un video del server di casa: lo si scarica da Jellyfin
// nella cache del lettore (vedi filmOffline), e poi si guarda anche col PC
// spento, in giro, senza rete. Il file così com'è quando il browser lo legge;
// altrimenti (MKV, HEVC, Dolby) un MP4 che Jellyfin converte mentre lo manda,
// perché salvare un file che il browser non sa aprire non servirebbe a niente.
//
// Lo scaricamento vive qui e non nel lettore: un film richiede minuti, e
// uscire dalla pagina (tornare all'elenco, aprire un altro episodio) non deve
// buttarlo via. Chi lo mostra si iscrive (`ascoltaCopie`).

export interface PianoCopia {
  url: string
  // Il nome del file salvato: quello vero, o lo stesso con «.mp4» se convertito.
  nome: string
  convertito: boolean
}

// La lingua scelta nel lettore resta quella della copia: il browser di un
// file ne suona una sola, e la copia non ha un server che ne converta altre.
export function pianoCopia(fileId: string, info: InfoJellyfin, audio: number | null, sessione: string): PianoCopia {
  const predefinita = tracciaPredefinita(info)
  const diretto = riproducibileDirettamente(info) && (audio === null || audio === predefinita?.indice)
  if (diretto) return { url: flussoDiretto(fileId), nome: info.nome, convertito: false }
  return {
    url: flussoMp4(fileId, info, audio ?? predefinita?.indice ?? null, sessione),
    nome: `${info.nome.replace(/\.[^.]+$/, '')}.mp4`,
    convertito: true,
  }
}

export interface ProgressoCopia {
  scaricati: number
  // Si sa solo per il file così com'è: una conversione al volo non lo dice.
  totale: number | null
  convertito: boolean
}

const inCorso = new Map<string, { progresso: ProgressoCopia; ferma: AbortController }>()
const ascoltatori = new Set<() => void>()
const avvisa = () => ascoltatori.forEach((a) => a())

export function ascoltaCopie(cb: () => void): () => void {
  ascoltatori.add(cb)
  return () => ascoltatori.delete(cb)
}

export function progressoCopia(fileId: string): ProgressoCopia | null {
  return inCorso.get(fileId)?.progresso ?? null
}

export function annullaCopia(fileId: string): void {
  inCorso.get(fileId)?.ferma.abort()
}

export class CopiaAnnullata extends Error {
  constructor() {
    super('Salvataggio annullato.')
  }
}

// Ogni quanti byte si ridice a che punto è: a ogni pezzo arrivato (64 KB)
// sarebbero decine di migliaia di disegni per un film.
const PASSO_AVVISO = 4 * 1024 ** 2

export async function copiaDaCasa(p: {
  fileId: string
  titolo: string
  info: InfoJellyfin
  audio: number | null
  sottotitoli: SottotitoloOffline[]
}): Promise<void> {
  const { fileId, titolo, info } = p
  if (inCorso.has(fileId)) return
  const sessione = `ciak-copia-${Math.random().toString(36).slice(2)}`
  const piano = pianoCopia(fileId, info, p.audio, sessione)
  const ferma = new AbortController()
  const voce = { progresso: { scaricati: 0, totale: piano.convertito ? null : info.dimensione, convertito: piano.convertito }, ferma }
  inCorso.set(fileId, voce)
  avvisa()
  try {
    let res: Response
    try {
      res = await fetch(piano.url, { signal: ferma.signal })
    } catch (e) {
      if (ferma.signal.aborted) throw new CopiaAnnullata()
      throw new ErroreJellyfin(`Il server di casa non risponde: il PC è acceso, con Jellyfin aperto? (${e instanceof Error ? e.message : 'rete'})`)
    }
    if (!res.ok || !res.body) throw new ErroreJellyfin(`Il server di casa non ha mandato il video (HTTP ${res.status}).`)
    let ultimo = 0
    const contato = res.body.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(pezzo, uscita) {
          const scaricati = voce.progresso.scaricati + pezzo.byteLength
          // Un oggetto nuovo a ogni avviso: chi lo disegna vede che è cambiato.
          voce.progresso = { ...voce.progresso, scaricati }
          if (scaricati - ultimo >= PASSO_AVVISO) {
            ultimo = scaricati
            avvisa()
          }
          uscita.enqueue(pezzo)
        },
      }),
    )
    try {
      await salvaRispostaSulDispositivo(
        { id: fileId, titolo, file: piano.nome, serie: info.serie },
        new Response(contato, { headers: { 'Content-Type': 'video/mp4' } }),
        p.sottotitoli,
      )
    } catch (e) {
      // Interrotto a metà, il browser lo dice come un errore di rete: si
      // guarda chi l'ha fermato, non il messaggio.
      if (ferma.signal.aborted) throw new CopiaAnnullata()
      throw e
    }
  } finally {
    inCorso.delete(fileId)
    avvisa()
    // Una conversione che non serve più si ferma: il PC lavorerebbe per niente.
    if (piano.convertito) fermaConversione(sessione)
  }
}
