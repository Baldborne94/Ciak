import { useSyncExternalStore } from 'react'

// Il voto di TMDB di un titolo, uguale ovunque in Ciak.
//
// Le righe sfogliabili («Di tendenza», le liste di /discover) portano il voto
// di una fotografia che TMDB rifà di rado; la scheda del titolo lo legge
// aggiornato. Per un film appena uscito, con pochi voti, la media cambia molto
// da un giorno all'altro: la locandina diceva 8.2 e la scheda 5.8. Il voto
// letto da una scheda si ricorda qui, e da lì in poi le locandine usano quello.

export const POCHI_VOTI = 10
const CHIAVE = 'ciak:voti-freschi'
const MASSIMO = 500

interface Voto {
  voto: number
  voti: number
  quando: number
}

let memoria: Map<string, Voto> | null = null
// Chi mostra un voto si riaggiorna quando ne arriva uno nuovo: tornando
// indietro dalla scheda, la locandina già a schermo deve cambiare.
let versione = 0
const ascoltatori = new Set<() => void>()

function leggi(): Map<string, Voto> {
  if (memoria) return memoria
  memoria = new Map()
  try {
    const salvati = JSON.parse(localStorage.getItem(CHIAVE) ?? '[]') as [string, Voto][]
    if (Array.isArray(salvati)) memoria = new Map(salvati.filter((r) => Array.isArray(r) && typeof r[1]?.voto === 'number'))
  } catch {
    /* copia illeggibile o storage negato: si riparte dai voti delle liste */
  }
  return memoria
}

// La chiave composta: un film e una serie possono avere lo stesso id.
const chiave = (tipo: string, id: number) => `${tipo}-${id}`

export function ricordaVoto(tipo: string, id: number, voto: number, voti: number, ora = Date.now()): void {
  const m = leggi()
  m.delete(chiave(tipo, id))
  m.set(chiave(tipo, id), { voto, voti, quando: ora })
  // Si tengono i più recenti: una Map ricorda l'ordine di inserimento.
  while (m.size > MASSIMO) m.delete(m.keys().next().value as string)
  try {
    localStorage.setItem(CHIAVE, JSON.stringify([...m]))
  } catch {
    /* storage pieno: il voto vale lo stesso per questa visita */
  }
  versione++
  ascoltatori.forEach((f) => f())
}

function ascolta(f: () => void) {
  ascoltatori.add(f)
  return () => {
    ascoltatori.delete(f)
  }
}

export function useVotoDaMostrare(item: Parameters<typeof votoDaMostrare>[0]): ReturnType<typeof votoDaMostrare> {
  useSyncExternalStore(ascolta, () => versione)
  return votoDaMostrare(item)
}

// Il voto da mostrare su una locandina: quello della scheda se è già stato
// letto, altrimenti quello della lista. Con pochi voti non è un giudizio ma
// un caso, e la locandina non lo mostra.
export function votoDaMostrare(item: { id: number; mediaType: string; voteAverage: number; voteCount?: number }): { voto: number; affidabile: boolean } {
  const fresco = leggi().get(chiave(item.mediaType, item.id))
  const voto = fresco?.voto ?? item.voteAverage
  const voti = fresco?.voti ?? item.voteCount
  return { voto, affidabile: voto > 0 && (voti === undefined || voti >= POCHI_VOTI) }
}

// Solo per i test: si riparte da storage vuoto.
export function dimenticaVoti(): void {
  memoria = null
}
