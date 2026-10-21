// Gli speciali di una serie (la stagione 0 di TMDB) riconosciuti dal nome del
// file, non dal numero che il file si dà. «Shingeki no Kyojin - S04P03 - THE
// FINAL CHAPTERS - Special 1» diventava lo speciale 1 di TMDB (un OAD), mentre
// è il 36, «The Final Chapters Special (1)»: episodio successivo, sottotitoli e
// «visto» finivano sull'episodio sbagliato.
//
// Prudente: si sposta solo uno speciale che combacia con un episodio solo,
// per almeno due parole del titolo e, se TMDB numera i suoi («Special (1)»),
// anche per il numero. Altrimenti resta il numero letto dal file.

export interface EpisodioSpeciale {
  numero: number
  // Il nome in più lingue (italiano e inglese): i file sono quasi sempre in inglese.
  nomi: string[]
}

// Parole che non dicono quale speciale sia: le hanno tutti.
const VUOTE = new Set([
  'the', 'and', 'del', 'della', 'delle', 'dei', 'gli', 'per', 'season', 'stagione', 'episode', 'episodio',
  'part', 'parte', 'special', 'speciale', 'speciali', 'specials', 'oad', 'ova', 'ona', 'movie', 'film',
])

function parole(testo: string): Set<string> {
  return new Set(
    testo
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((p) => p.length >= 3 && !/\d/.test(p) && !VUOTE.has(p)),
  )
}

// Il numero dello speciale nel nome del file: «Special 1», «OADE01», «OVA 3».
const NUMERO_FILE = /\b(?:special|speciale|sp|oad|ova|ona)\s*[-_.]?\s*(?:e|ep)?\s*(\d{1,3})\b/i

function numeriDi(nome: string): number[] {
  return [...nome.matchAll(/\b(\d{1,3})\b/g)].map((m) => Number(m[1]))
}

export function abbinaSpeciale(nomeFile: string, episodi: EpisodioSpeciale[]): number | null {
  const base = nomeFile.replace(/\.[a-z0-9]{2,4}$/i, '')
  const letto = NUMERO_FILE.exec(base)
  const numero = letto ? Number(letto[1]) : null
  const delFile = parole(base)
  const adatti = episodi.filter((e) => {
    const numeri = e.nomi.flatMap(numeriDi)
    if (numero !== null && numeri.length > 0 && !numeri.includes(numero)) return false
    const comuni = [...new Set(e.nomi.flatMap((n) => [...parole(n)]))].filter((p) => delFile.has(p))
    return comuni.length >= 2
  })
  return adatti.length === 1 ? adatti[0].numero : null
}
