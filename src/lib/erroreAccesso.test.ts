import { describe, it, expect } from 'vitest'
import { leggiErroreAccesso, spiegaErroreAccesso } from './erroreAccesso'

describe('spiegaErroreAccesso', () => {
  it('registrazioni chiuse: dice che Google ha funzionato e cosa va cambiato', () => {
    const testo = spiegaErroreAccesso({ message: 'Signups not allowed for this instance', code: 'signup_disabled' })
    expect(testo).toMatch(/Google ti ha riconosciuto/)
    expect(testo).toMatch(/Allow new users to sign up/)
  })

  it('riconosce le registrazioni chiuse anche senza codice', () => {
    expect(spiegaErroreAccesso({ message: 'Signups not allowed for this instance' })).toMatch(/account nuovi/)
  })

  it("l'accesso annullato su Google non sembra un guasto", () => {
    expect(spiegaErroreAccesso({ message: 'The user denied access', code: 'access_denied' })).toMatch(/annullato/)
  })

  it('un errore sconosciuto riporta il messaggio originale, per poterlo cercare', () => {
    expect(spiegaErroreAccesso({ message: 'Unable to exchange external code: 4/0Ab' })).toMatch(
      /Unable to exchange external code: 4\/0Ab/,
    )
  })
})

describe('leggiErroreAccesso', () => {
  it("prende codice e descrizione dall'indirizzo di ritorno", () => {
    expect(
      leggiErroreAccesso(
        'https://ciak.app/#error=server_error&error_code=signup_disabled&error_description=Signups+not+allowed+for+this+instance',
      ),
    ).toEqual({ message: 'Signups not allowed for this instance', code: 'signup_disabled' })
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

  it('un rifiuto del collegamento a Drive non è un login fallito', () => {
    expect(leggiErroreAccesso('https://ciak.app/streaming#error=access_denied&state=ciak-drive-abc')).toBeNull()
  })
})
