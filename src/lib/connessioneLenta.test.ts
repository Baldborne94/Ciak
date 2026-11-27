import { describe, expect, it } from 'vitest'
import { connessioneLenta, FINESTRA_MS, LUNGA_MS } from './connessioneLenta'

// Quando il video del server di casa si ferma troppo spesso a caricare, il
// lettore passa alla qualità ridotta.
describe('connessioneLenta', () => {
  const t = 1_000_000
  it('tre attese in due minuti sono troppe, due no', () => {
    const due = [
      { inizio: t, fine: t + 2000 },
      { inizio: t + 30_000, fine: t + 31_000 },
    ]
    expect(connessioneLenta(due, t + 40_000)).toBe(false)
    expect(connessioneLenta([...due, { inizio: t + 60_000, fine: null }], t + 60_000)).toBe(true)
  })

  it('attese lontane fra loro non si sommano', () => {
    const sparse = [0, 1, 2].map((i) => ({ inizio: t + i * (FINESTRA_MS / 2 + 1000), fine: t + i * (FINESTRA_MS / 2 + 1000) + 1000 }))
    expect(connessioneLenta(sparse, t + 2 * (FINESTRA_MS / 2 + 1000))).toBe(false)
  })

  it('un’attesa sola basta, se dura più di dieci secondi', () => {
    expect(connessioneLenta([{ inizio: t, fine: null }], t + LUNGA_MS - 1)).toBe(false)
    expect(connessioneLenta([{ inizio: t, fine: null }], t + LUNGA_MS)).toBe(true)
    // Finita, non conta più per la sua durata.
    expect(connessioneLenta([{ inizio: t, fine: t + 15_000 }], t + 20_000)).toBe(false)
  })
})
