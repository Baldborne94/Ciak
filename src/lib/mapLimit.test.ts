import { describe, it, expect } from 'vitest'
import { mapLimit } from './mapLimit'

// Registra quante chiamate sono in volo contemporaneamente, per verificare che
// il tetto sia davvero rispettato e non solo dichiarato.
function tracker() {
  let inFlight = 0
  let peak = 0
  const run = async <R>(fn: () => Promise<R>): Promise<R> => {
    inFlight++
    peak = Math.max(peak, inFlight)
    try {
      return await fn()
    } finally {
      inFlight--
    }
  }
  return { run, peak: () => peak }
}

const tick = () => new Promise((r) => setTimeout(r, 1))

describe('mapLimit', () => {
  it('non supera mai il tetto di chiamate contemporanee', async () => {
    const t = tracker()
    await mapLimit(Array.from({ length: 50 }, (_, i) => i), 4, (n) =>
      t.run(async () => {
        await tick()
        return n
      }),
    )
    expect(t.peak()).toBeLessThanOrEqual(4)
  })

  it('sfrutta davvero il parallelismo consentito', async () => {
    const t = tracker()
    await mapLimit(Array.from({ length: 20 }, (_, i) => i), 5, (n) =>
      t.run(async () => {
        await tick()
        return n
      }),
    )
    expect(t.peak()).toBe(5)
  })

  it('restituisce i risultati nell ordine della lista, non di completamento', async () => {
    // Il primo elemento è il più lento: se l'ordine seguisse il completamento
    // finirebbe in fondo.
    const out = await mapLimit([30, 1, 2, 3], 4, async (ms) => {
      await new Promise((r) => setTimeout(r, ms))
      return ms
    })
    expect(out).toEqual([30, 1, 2, 3])
  })

  it('processa ogni elemento una volta sola', async () => {
    const visti: number[] = []
    await mapLimit([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      visti.push(n)
      return n
    })
    expect(visti.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('gestisce una lista vuota e un tetto più grande della lista', async () => {
    expect(await mapLimit([], 5, async (n) => n)).toEqual([])
    expect(await mapLimit([1, 2], 10, async (n) => n * 2)).toEqual([2, 4])
  })
})
