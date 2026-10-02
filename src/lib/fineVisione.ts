// Quando un film (o un episodio) conta come visto. In un modulo a sé perché
// serve sia al lettore (streaming.ts) sia alla videoteca (videoteca.ts), che
// si importano a vicenda.

// Oltre il 90%, o negli ultimi tre minuti: i titoli di coda non si guardano.
export const SOGLIA_FINE = 0.9
const CODA_SECONDI = 180
// Almeno metà film guardata davvero: saltare alla fine per provare il lettore
// non deve riempire il diario.
export const QUOTA_GUARDATA = 0.5

export function arrivatoAllaFine(posizione: number, durata: number | null): boolean {
  if (!durata || durata <= 0) return false
  return posizione >= durata * SOGLIA_FINE || durata - posizione <= CODA_SECONDI
}

export function contaComeVisto(posizione: number, durata: number | null, secondiVisti: number): boolean {
  return arrivatoAllaFine(posizione, durata) && !!durata && secondiVisti >= durata * QUOTA_GUARDATA
}
