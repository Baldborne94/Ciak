import { describe, it, expect } from 'vitest'
import { chiaveCollezione, copiaValida, etichettaCopia } from './offlineCache'

describe('chiaveCollezione', () => {
  it('tiene separati due account sullo stesso browser', () => {
    // Senza l'id nella chiave, chi si scollega e rientra con un altro account
    // si troverebbe offline la collezione del primo.
    expect(chiaveCollezione('u1')).not.toBe(chiaveCollezione('u2'))
    expect(chiaveCollezione('u1')).toContain('u1')
  })
})

describe('copiaValida', () => {
  it('accetta una copia ben formata', () => {
    const c = copiaValida<{ id: number }>({
      salvatoIl: '2026-08-31T09:00:00.000Z',
      dati: [{ id: 1 }],
    })
    expect(c?.dati).toHaveLength(1)
    expect(c?.salvatoIl).toBe('2026-08-31T09:00:00.000Z')
  })

  it('rifiuta il residuo di una versione precedente', () => {
    // È il caso che conta: una copia di forma diversa non deve produrre una
    // schermata sbagliata in silenzio — meglio nessun offline che un offline
    // che mente.
    expect(copiaValida({ dati: [1, 2] })).toBeNull()
    expect(copiaValida({ salvatoIl: '2026-08-31T09:00:00Z' })).toBeNull()
    expect(copiaValida({ salvatoIl: 'non una data', dati: [] })).toBeNull()
    expect(copiaValida({ salvatoIl: '2026-08-31T09:00:00Z', dati: 'no' })).toBeNull()
  })

  it('rifiuta null e roba che non è un oggetto', () => {
    expect(copiaValida(null)).toBeNull()
    expect(copiaValida('stringa')).toBeNull()
    expect(copiaValida(42)).toBeNull()
  })

  it('accetta una copia vuota, che è diversa da una copia assente', () => {
    // Una collezione svuotata davvero è un dato legittimo, non un errore.
    expect(copiaValida({ salvatoIl: '2026-08-31T09:00:00Z', dati: [] })?.dati).toEqual([])
  })
})

describe('etichettaCopia', () => {
  const adesso = new Date('2026-08-31T18:00:00')

  it('per oggi dice l ora, che è ciò che serve sapere', () => {
    const testo = etichettaCopia(new Date('2026-08-31T14:32:00').toISOString(), adesso)
    expect(testo).toContain('oggi')
    expect(testo).toContain('14:32')
  })

  it('distingue ieri', () => {
    const testo = etichettaCopia(new Date('2026-08-30T22:10:00').toISOString(), adesso)
    expect(testo).toContain('ieri')
  })

  it('più indietro dice la data, perché «3 giorni fa» non aiuta', () => {
    const testo = etichettaCopia(new Date('2026-08-20T10:00:00').toISOString(), adesso)
    expect(testo).toContain('20 agosto')
  })

  it('non si rompe su una data illeggibile', () => {
    expect(etichettaCopia('spazzatura', adesso)).toBe('salvata in precedenza')
  })
})
