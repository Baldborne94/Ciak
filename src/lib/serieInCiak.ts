import { eLocale } from './filmLocali'
import { ordinaEpisodi, sigla, type GruppoSerie } from './videoteca'

// Le serie tenute in Ciak su questo dispositivo: i loro episodi si copiano
// nella cache del lettore, così si guardano senza ridare il permesso alla
// cartella (che Chrome su Android dimentica quando chiude l'app) e senza rete.
// Gli episodi nuovi aggiunti alla cartella si copiano da soli alla prima
// lettura della videoteca; con `liberaDopoVisione` la copia di un episodio
// visto si toglie, e il file originale resta dov'è.
//
// Vale per il dispositivo, non per l'account: è lo spazio di questo tablet.
// La chiave è la cartella della serie (GruppoSerie.cartella), che non cambia
// quando la serie viene riconosciuta.

const CHIAVE = 'ciak:serie-in-ciak'
export const EVENTO_SERIE_IN_CIAK = 'ciak:serie-in-ciak'

export interface SerieInCiak {
  titolo: string
  liberaDopoVisione: boolean
}

export function leggiSerieInCiak(): Record<string, SerieInCiak> {
  try {
    const grezzo = JSON.parse(localStorage.getItem(CHIAVE) ?? '{}') as unknown
    if (!grezzo || typeof grezzo !== 'object' || Array.isArray(grezzo)) return {}
    const valide: Record<string, SerieInCiak> = {}
    for (const [cartella, v] of Object.entries(grezzo as Record<string, unknown>)) {
      const s = v as Partial<SerieInCiak> | null
      if (s && typeof s.titolo === 'string') valide[cartella] = { titolo: s.titolo, liberaDopoVisione: s.liberaDopoVisione !== false }
    }
    return valide
  } catch {
    return {}
  }
}

function scrivi(tutte: Record<string, SerieInCiak>): void {
  try {
    localStorage.setItem(CHIAVE, JSON.stringify(tutte))
  } catch {
    // Senza memoria locale la serie non resta segnata: si ricopia a mano.
  }
  window.dispatchEvent(new Event(EVENTO_SERIE_IN_CIAK))
}

export function tieniSerieInCiak(cartella: string, titolo: string, liberaDopoVisione = true): void {
  scrivi({ ...leggiSerieInCiak(), [cartella]: { titolo, liberaDopoVisione } })
}

export function cambiaLiberaDopoVisione(cartella: string, libera: boolean): void {
  const tutte = leggiSerieInCiak()
  if (!tutte[cartella]) return
  scrivi({ ...tutte, [cartella]: { ...tutte[cartella], liberaDopoVisione: libera } })
}

export function lasciaSerieInCiak(cartella: string): void {
  const tutte = leggiSerieInCiak()
  delete tutte[cartella]
  scrivi(tutte)
}

export interface EpisodioDaCopiare {
  id: string
  titolo: string
  serie: string
  // La serie a cui appartiene, come la chiave di `tenute`.
  cartella: string
}

// Cosa fare per le serie tenute in Ciak, dati gli episodi nella cartella e
// quelli già salvati: copiare quelli che mancano (i non visti per primi, in
// ordine: sono i prossimi da guardare) e togliere le copie dei visti, dove si
// è scelto di liberare spazio. Un episodio visto non si copia proprio: andrebbe
// tolto subito dopo. Solo i video del disco (loc-): quelli del server di casa
// non hanno un file da copiare.
export function pianoSerieInCiak(
  gruppi: Pick<GruppoSerie, 'cartella' | 'titolo' | 'episodi'>[],
  tenute: Record<string, SerieInCiak>,
  salvati: Set<string>,
): { daCopiare: EpisodioDaCopiare[]; daLiberare: string[] } {
  const daCopiare: EpisodioDaCopiare[] = []
  const daLiberare: string[] = []
  for (const g of gruppi) {
    const tenuta = tenute[g.cartella]
    if (!tenuta) continue
    const episodi = ordinaEpisodi(g.episodi).filter((e) => eLocale(e.id))
    for (const e of episodi) {
      const via = tenuta.liberaDopoVisione && e.visto
      if (salvati.has(e.id)) {
        if (via) daLiberare.push(e.id)
      } else if (!via) {
        daCopiare.push({ id: e.id, titolo: sigla(e) ? `${g.titolo} · ${sigla(e)}` : e.nome, serie: g.titolo, cartella: g.cartella })
      }
    }
  }
  return { daCopiare, daLiberare }
}
