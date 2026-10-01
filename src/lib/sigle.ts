import { arrivatoAllaFine } from './streaming'

// Saltare le sigle e passare da soli all'episodio dopo. Nessun dato dice dove
// sta la sigla di un episodio (Netflix usa segnaposti suoi): «⏭ Salta sigla»
// la salta quando la si vede partire, di una durata che si sceglie una volta
// per serie.

// Quasi tutte le sigle degli anime durano un minuto e mezzo.
export const DURATA_SIGLA_PREDEFINITA = 90
// Il pulsante resta nei primi minuti: prima della sigla c'è spesso una scena
// d'apertura, che cambia lunghezza da un episodio all'altro.
export const FINESTRA_SIGLA = 6 * 60
// Le durate proposte: da 15 secondi a 2 minuti e mezzo, di 5 in 5.
export const DURATE_SIGLA = Array.from({ length: 28 }, (_, i) => 15 + i * 5)
// Il conto alla rovescia prima dell'episodio dopo, a fine episodio.
export const SECONDI_AL_PROSSIMO = 10

export function mostraSaltaSigla(posizione: number): boolean {
  return posizione < FINESTRA_SIGLA
}

// Dalla sigla finale in poi (gli stessi ultimi minuti in cui l'episodio conta
// come visto) si propone l'episodio dopo, senza aspettare la fine.
export function inSiglaFinale(posizione: number, durata: number | null): boolean {
  return arrivatoAllaFine(posizione, durata)
}

// Dove saltare: mai oltre la fine, che chiuderebbe l'episodio di colpo.
export function dopoLaSigla(posizione: number, durataSigla: number, durataVideo: number | null): number {
  const arrivo = posizione + durataSigla
  return durataVideo ? Math.min(arrivo, Math.max(0, durataVideo - 1)) : arrivo
}

// La durata della sigla di una serie (chiave `tv-${tmdbId}`). Sta sul
// dispositivo: è una comodità, e una serie senza scelta usa quella di base.
const CHIAVE = 'ciak:durata-sigla:'

export function leggiDurataSigla(serie: string): number {
  try {
    const n = Number(localStorage.getItem(CHIAVE + serie))
    return DURATE_SIGLA.includes(n) ? n : DURATA_SIGLA_PREDEFINITA
  } catch {
    return DURATA_SIGLA_PREDEFINITA
  }
}

export function salvaDurataSigla(serie: string, secondi: number): void {
  try {
    localStorage.setItem(CHIAVE + serie, String(secondi))
  } catch {
    /* storage pieno o negato: resta quella di base */
  }
}
