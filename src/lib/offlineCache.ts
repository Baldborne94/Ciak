// La collezione è l'unica cosa di Ciak che non cambia da sola: i film che hai
// visto restano visti anche in metropolitana. Finora però l'app, offline, si
// apriva e restava vuota — il guscio arrivava dal service worker, i dati no.
//
// Qui teniamo una copia dell'ultima lettura riuscita e la si serve quando la
// rete non risponde. Sempre dichiarandolo: una copia vecchia spacciata per dato
// fresco è peggio di una schermata di errore, perché non si può nemmeno
// sospettare.

const PREFISSO = 'ciak:offline:'
const VERSIONE = 'v1'

export interface Copia<T> {
  salvatoIl: string
  dati: T[]
}

// La chiave porta l'id dell'utente: due account sullo stesso browser non devono
// vedersi la collezione a vicenda quando la rete manca.
export function chiaveCollezione(userId: string): string {
  return `${PREFISSO}collezione:${VERSIONE}:${userId}`
}

// Una copia va usata solo se ha la forma attesa: il residuo di una versione
// precedente non deve produrre una schermata sbagliata in silenzio.
export function copiaValida<T>(grezzo: unknown): Copia<T> | null {
  if (!grezzo || typeof grezzo !== 'object') return null
  const c = grezzo as Partial<Copia<T>>
  if (typeof c.salvatoIl !== 'string' || !Array.isArray(c.dati)) return null
  if (Number.isNaN(Date.parse(c.salvatoIl))) return null
  return { salvatoIl: c.salvatoIl, dati: c.dati as T[] }
}

export function salvaCopia<T>(chiave: string, dati: T[], quando: Date = new Date()): void {
  try {
    const copia: Copia<T> = { salvatoIl: quando.toISOString(), dati }
    localStorage.setItem(chiave, JSON.stringify(copia))
  } catch {
    // Quota piena o storage negato: la copia è un di più, non un requisito.
    // Non passa da logFailure perché fallirebbe a ogni scrittura, riempiendo il
    // diario degli errori di una riga che non aiuta nessuno.
  }
}

export function leggiCopia<T>(chiave: string): Copia<T> | null {
  try {
    const grezzo = localStorage.getItem(chiave)
    return grezzo ? copiaValida<T>(JSON.parse(grezzo)) : null
  } catch {
    return null
  }
}

export function scartaCopia(chiave: string): void {
  try {
    localStorage.removeItem(chiave)
  } catch {
    /* niente da fare, e niente di grave */
  }
}

// «salvata oggi alle 14:32» dice più di una data intera; «il 28 agosto» dice
// più di «2 giorni fa» quando la copia comincia a essere vecchia davvero.
export function etichettaCopia(salvatoIl: string, adesso: Date = new Date()): string {
  const d = new Date(salvatoIl)
  if (Number.isNaN(d.getTime())) return 'salvata in precedenza'
  const ora = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
  const stessoGiorno = d.toDateString() === adesso.toDateString()
  if (stessoGiorno) return `salvata oggi alle ${ora}`
  const ieri = new Date(adesso)
  ieri.setDate(ieri.getDate() - 1)
  if (d.toDateString() === ieri.toDateString()) return `salvata ieri alle ${ora}`
  return `salvata il ${d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}`
}
