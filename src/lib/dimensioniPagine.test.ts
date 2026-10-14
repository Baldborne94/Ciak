import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'

// Le pagine dello streaming erano arrivate a 1222 e 1044 righe, perché
// aggiungere lì era sempre la strada più corta: divise in hook (src/lib/use*)
// e componenti, ora stanno sotto il tetto. Questo test le tiene lì, come
// tmdb.test.ts fa coi moduli del catalogo.
//
// Le pagine già oltre il tetto sono eccezioni dichiarate, ognuna ferma alla
// lunghezza di oggi: possono solo scendere. Quando una scende sotto il tetto
// esce dall'elenco (lo dice il secondo test).

const dir = new URL('../pages/', import.meta.url)
const TETTO = 600
const ECCEZIONI: Record<string, number> = {
  'Search.tsx': 831,
  'DiaryPage.tsx': 717,
  'TitleDetail.tsx': 709,
}

const righe = (nome: string) => readFileSync(new URL(nome, dir), 'utf8').split('\n').length

describe('dimensioni delle pagine', () => {
  it(`nessuna pagina supera ${TETTO} righe, e le eccezioni non crescono`, () => {
    for (const nome of readdirSync(dir).filter((n) => n.endsWith('.tsx'))) {
      const tetto = ECCEZIONI[nome] ?? TETTO
      expect(righe(nome), `${nome}: ${righe(nome)} righe (tetto ${tetto}). Dividila in hook e componenti invece di alzare il tetto.`).toBeLessThanOrEqual(tetto)
    }
  })

  it('un’eccezione scesa sotto il tetto esce dall’elenco', () => {
    for (const nome of Object.keys(ECCEZIONI)) {
      expect(righe(nome), `${nome} sta sotto ${TETTO} righe: toglila da ECCEZIONI`).toBeGreaterThan(TETTO)
    }
  })
})
