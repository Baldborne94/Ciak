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

// Senza sapere dove sta la sigla, il pulsante resta nei primi minuti. Se la
// serie ha già il suo punto, solo intorno a quello: a 3:25 di un episodio di
// South Park, con la sigla a 0:04, «Salta sigla» non aveva più senso. Si
// comincia un po' prima, perché la scena d'apertura cambia di qualche secondo.
const ANTICIPO_PULSANTE = 15

export function mostraSaltaSigla(posizione: number, inizio: number | null = null, durata = DURATA_SIGLA_PREDEFINITA): boolean {
  if (inizio === null) return posizione < FINESTRA_SIGLA
  return posizione >= Math.max(0, inizio - ANTICIPO_PULSANTE) && posizione < inizio + durata
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

// ── Saltarle da sole ────────────────────────────────────────────────────────
// Due caselle valide per tutte le serie: saltare sempre la sigla iniziale, e
// anche quella finale. Dove stanno lo si impara da chi guarda: il punto in cui
// ha premuto «⏭ Salta sigla» l'ultima volta in quella serie, e quanto mancava
// alla fine quando ha premuto «⏭ Prossimo episodio». La sigla finale, misurata
// dalla fine, cade quasi sempre allo stesso punto; quella iniziale meno,
// perché la scena prima della sigla cambia lunghezza: per questo, saltata da
// sola, si può tornare indietro.

export interface SaltaSigle {
  inizio: boolean
  fine: boolean
}

const CHIAVE_SCELTE = 'ciak:salta-sigle'

export function leggiSaltaSigle(): SaltaSigle {
  try {
    const v = JSON.parse(localStorage.getItem(CHIAVE_SCELTE) ?? '{}') as Partial<SaltaSigle>
    return { inizio: v.inizio === true, fine: v.fine === true }
  } catch {
    return { inizio: false, fine: false }
  }
}

export function salvaSaltaSigle(scelte: SaltaSigle): void {
  try {
    localStorage.setItem(CHIAVE_SCELTE, JSON.stringify(scelte))
  } catch {
    /* storage negato: le caselle tornano vuote alla prossima apertura */
  }
}

// I punti di una serie, imparati saltando a mano o impostati da chi guarda
// (vedi SigleSerie): dove comincia e dove finisce la sigla iniziale (secondi
// dall'inizio) e dove comincia la sigla finale (secondi prima della fine:
// gli episodi non durano tutti uguale, i titoli di coda sì).
export interface PuntiSigla {
  inizio: number | null
  fine: number | null
  coda: number | null
}

export const PUNTI_VUOTI: PuntiSigla = { inizio: null, fine: null, coda: null }

const CHIAVE_PUNTI = 'ciak:punti-sigla:'

const numeroValido = (n: unknown): number | null => (typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null)

export function leggiPuntiSigla(serie: string): PuntiSigla {
  try {
    const v = JSON.parse(localStorage.getItem(CHIAVE_PUNTI + serie) ?? '{}') as Record<string, unknown>
    return { inizio: numeroValido(v.inizio), fine: numeroValido(v.fine), coda: numeroValido(v.coda) }
  } catch {
    return PUNTI_VUOTI
  }
}

export function salvaPuntiSigla(serie: string, punti: PuntiSigla): void {
  try {
    localStorage.setItem(CHIAVE_PUNTI + serie, JSON.stringify(punti))
  } catch {
    /* storage negato: si impareranno di nuovo */
  }
}

// La sigla iniziale si salta da sola solo passandoci sopra mentre il video
// scorre (un timeupdate arriva ogni quarto di secondo circa): chi riprende un
// episodio già oltre quel punto, o ci torna apposta, non viene rimandato avanti.
const MARGINE_PASSAGGIO = 2

export function inizioSiglaRaggiunto(posizione: number, inizio: number | null): boolean {
  return inizio !== null && posizione >= inizio && posizione < inizio + MARGINE_PASSAGGIO
}

export function codaSiglaRaggiunta(posizione: number, durata: number | null, coda: number | null): boolean {
  return coda !== null && !!durata && durata - posizione <= coda
}

// Quanto manca alla fine, da ricordare come inizio della sigla finale.
export function secondiAllaFine(posizione: number, durata: number | null): number | null {
  return durata ? Math.max(0, Math.round(durata - posizione)) : null
}

// ── Con i tempi esatti dell'episodio (TheIntroDB) ───────────────────────────
// «⏭ Salta sigla» compare solo mentre la sigla c'è davvero: un episodio
// senza sigla non lo mostra, e il salto arriva proprio alla fine della sigla.
export function inSiglaEsatta(posizione: number, sigla: { da: number; a: number }): boolean {
  return posizione >= Math.max(0, sigla.da - 1) && posizione < sigla.a - 1
}

// Quanto dura la sigla iniziale di una serie: dai suoi due punti, se ci sono e
// hanno senso, se no la durata scelta (o quella di base).
export function durataDaPunti(punti: PuntiSigla, base: number): number {
  return punti.inizio !== null && punti.fine !== null && punti.fine > punti.inizio ? punti.fine - punti.inizio : base
}

// Dove arriva «⏭ Salta sigla»: alla fine della sigla, se la serie la conosce
// e non la si è già passata; se no avanti della sua durata.
export function arrivoSalto(posizione: number, punti: PuntiSigla, durata: number, durataVideo: number | null): number {
  if (punti.fine !== null && posizione < punti.fine) return punti.fine
  return dopoLaSigla(posizione, durata, durataVideo)
}

// Dove finisce la sigla lo si impara da chi corregge il salto: «Salta sigla»
// va avanti della durata di base (o di quella già imparata), e se subito dopo
// si trascina la barra al punto giusto, quello è la fine della sigla di
// questa serie. Un salto all'indietro fino a dove si era (↩ Rivedi la sigla)
// e un ritorno all'inizio dell'episodio non insegnano niente.
export interface Salto {
  da: number
  a: number
  quando: number // Date.now()
}

export const FINESTRA_CORREZIONE_MS = 20_000

export function fineDaCorrezione(salto: Salto | null, posizione: number, ora: number): number | null {
  if (!salto || ora - salto.quando > FINESTRA_CORREZIONE_MS) return null
  if (posizione < salto.da + 5 || posizione > salto.a + 120) return null
  if (Math.abs(posizione - salto.a) < 1) return null
  return Math.round(posizione)
}
