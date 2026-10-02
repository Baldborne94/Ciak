import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { leggiPresenti, salvaPresenti, soloPresenti } from './videoPresenti'

const riga = (id: string) => ({ drive_file_id: id })

describe('i video ancora su Drive', () => {
  let memoria: Map<string, string>
  beforeEach(() => {
    memoria = new Map()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => memoria.get(k) ?? null,
      setItem: (k: string, v: string) => void memoria.set(k, v),
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('senza un elenco di Drive non si toglie niente: meglio un pulsante in più che uno sparito', () => {
    expect(leggiPresenti()).toBeNull()
    expect(soloPresenti([riga('a'), riga('b')], null, new Set()).map((r) => r.drive_file_id)).toEqual(['a', 'b'])
  })

  it('tolto da Drive, il file non porta più al lettore; ma se è scaricato sul dispositivo sì', () => {
    salvaPresenti(['a'])
    const presenti = leggiPresenti()
    expect(soloPresenti([riga('a'), riga('b'), riga('c')], presenti, new Set(['c'])).map((r) => r.drive_file_id)).toEqual(['a', 'c'])
  })

  it('un elenco rovinato vale come nessun elenco', () => {
    memoria.set('ciak:drive-presenti', '{rotto')
    expect(leggiPresenti()).toBeNull()
    memoria.set('ciak:drive-presenti', JSON.stringify({ ids: 'non una lista' }))
    expect(leggiPresenti()).toBeNull()
  })
})
