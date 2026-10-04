import { describe, expect, it } from 'vitest'
import { azioneRichiesta, leggiRinnovo, leggiScambio } from './drive'

describe('le risposte di Google', () => {
  it('un rinnovo riuscito dà il token e quanto dura', () => {
    expect(leggiRinnovo({ access_token: 'tok', expires_in: 3599 })).toEqual({ token: 'tok', secondi: 3599 })
    expect(leggiRinnovo({ access_token: 'tok' })).toEqual({ token: 'tok', secondi: 3600 })
  })

  it('un permesso tolto si riconosce, e si distingue da un altro errore', () => {
    expect(leggiRinnovo({ error: 'invalid_grant' })).toEqual({ revocato: true })
    expect(leggiRinnovo({ error: 'invalid_client' })).toEqual({ errore: 'invalid_client' })
    expect(leggiRinnovo({})).toEqual({ errore: 'Google non ha risposto.' })
  })

  it('lo scambio del codice porta anche il refresh token, quando c è', () => {
    expect(leggiScambio({ access_token: 'tok', refresh_token: 'ref', expires_in: 3599 })).toEqual({ token: 'tok', refresh: 'ref', secondi: 3599 })
    expect(leggiScambio({ access_token: 'tok' })).toEqual({ token: 'tok', refresh: null, secondi: 3600 })
    expect(leggiScambio({ error: 'invalid_grant', error_description: 'Bad code' })).toEqual({ errore: 'Bad code' })
  })
})

describe('azioneRichiesta', () => {
  it('dal parametro, o dalla forma della risposta di Google se la riscrittura non lo passa', () => {
    expect(azioneRichiesta({ azione: 'token' })).toBe('token')
    expect(azioneRichiesta({ azione: 'auth' })).toBe('auth')
    expect(azioneRichiesta({ code: 'c', state: 's' })).toBe('callback')
    expect(azioneRichiesta({ error: 'access_denied', state: 's' })).toBe('callback')
    expect(azioneRichiesta({ azione: 'altro' })).toBeNull()
    expect(azioneRichiesta(undefined)).toBeNull()
  })
})
