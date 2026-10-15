import { describe, it, expect } from 'vitest'
import { leggiErroreAccesso, spiegaErroreAccesso } from './erroreAccesso'

describe('spiegaErroreAccesso', () => {
  it('il link dell’email scaduto o già usato: dice come averne un altro', () => {
    const testo = spiegaErroreAccesso({ message: 'Email link is invalid or has expired', code: 'otp_expired' })
    expect(testo).toMatch(/scaduto o è già stato usato/)
    expect(testo).toMatch(/Password dimenticata\?/)
  })

  it('lo riconosce anche senza codice', () => {
    expect(spiegaErroreAccesso({ message: 'Email link is invalid or has expired' })).toMatch(/scaduto/)
  })

  it('un errore sconosciuto riporta il messaggio originale, per poterlo cercare', () => {
    expect(spiegaErroreAccesso({ message: 'Database error saving new user' })).toBe(
      "L'accesso dal link non è riuscito: Database error saving new user",
    )
  })
})

describe('leggiErroreAccesso', () => {
  it('decodifica anche una descrizione codificata due volte', () => {
    // Supabase rimanda «code%3A 4%2F0A…»: a schermo usciva così.
    expect(
      leggiErroreAccesso('https://ciak.vercel.app/#error=server_error&error_code=unexpected_failure&error_description=Unable+to+exchange+external+code%253A+4%252F0AVGz'),
    ).toEqual({ message: 'Unable to exchange external code: 4/0AVGz', code: 'unexpected_failure' })
  })

  it("prende codice e descrizione dall'indirizzo di ritorno", () => {
    expect(
      leggiErroreAccesso('https://ciak.app/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'),
    ).toEqual({ message: 'Email link is invalid or has expired', code: 'otp_expired' })
  })

  it('legge anche gli errori nella query (?error=…)', () => {
    expect(leggiErroreAccesso('https://ciak.app/?error=access_denied&error_description=denied')).toEqual({
      message: 'denied',
      code: 'access_denied',
    })
  })

  it('un indirizzo normale o un login riuscito non sono errori', () => {
    expect(leggiErroreAccesso('https://ciak.app/watchlist')).toBeNull()
    expect(leggiErroreAccesso('https://ciak.app/#access_token=x&refresh_token=y')).toBeNull()
  })
})
