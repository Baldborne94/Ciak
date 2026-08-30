import { describe, it, expect } from 'vitest'
import { valutaSchema, messaggioSchema } from './schemaVersion'

describe('valutaSchema', () => {
  it('sta zitto quando il database è allineato', () => {
    expect(valutaSchema(16, null, 16)).toEqual({ stato: 'ok', versione: 16 })
  })

  it('sta zitto anche se il database è più avanti del codice', () => {
    // Succede fra il momento in cui esegui il SQL e il deploy: non è un guaio.
    expect(valutaSchema(17, null, 16)).toEqual({ stato: 'ok', versione: 17 })
  })

  it('segnala un database indietro, dicendo di quanto', () => {
    expect(valutaSchema(14, null, 16)).toEqual({ stato: 'vecchio', versione: 14 })
  })

  it('riconosce il registro mancante dai codici di PostgREST', () => {
    // 42P01 = relazione inesistente; PGRST205 = assente dalla cache dello schema.
    expect(valutaSchema(null, { code: '42P01' }, 16)).toEqual({ stato: 'assente' })
    expect(valutaSchema(null, { code: 'PGRST205' }, 16)).toEqual({ stato: 'assente' })
  })

  it('non allarma per un errore che non sa interpretare', () => {
    // Questa è la parte che conta: un blip di rete o un 500 non devono
    // apparire all'utente come "il tuo database è vecchio, esegui degli SQL".
    expect(valutaSchema(null, { code: '500', message: 'Failed to fetch' }, 16)).toBeNull()
    expect(valutaSchema(null, { message: 'network error' }, 16)).toBeNull()
  })

  it('tratta un registro vuoto come registro assente', () => {
    // La tabella c'è ma nessuno ci ha scritto: non sappiamo a che punto siamo.
    expect(valutaSchema(null, null, 16)).toEqual({ stato: 'assente' })
  })
})

describe('messaggioSchema', () => {
  it('dice la versione trovata e quella che serve', () => {
    const testo = messaggioSchema({ stato: 'vecchio', versione: 14 }, 16)
    expect(testo).toContain('v14')
    expect(testo).toContain('v16')
    // E dice anche cosa fare, non solo che qualcosa non va.
    expect(testo).toContain('supabase/')
  })

  it('ammette di non sapere la versione quando il registro non c è', () => {
    const testo = messaggioSchema({ stato: 'assente' }, 16)
    expect(testo).toContain('sconosciuta')
    expect(testo).toContain('16')
  })
})
