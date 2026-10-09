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

  it("un rifiuto di Google indica anche la causa più comune: l'app in prova", () => {
    // Con la schermata di consenso in «Testing», Google rifiuta chi non è fra
    // gli utenti di prova con lo stesso access_denied di un annullamento.
    const testo = spiegaErroreAccesso({ message: 'The user denied access', code: 'access_denied' })
    expect(testo).toMatch(/annullato/)
    expect(testo).toMatch(/utenti di prova/)
  })

  it('il codice di Google non scambiato: cosa provare, e cosa controllare se succede a tutti', () => {
    // L'amico su Chrome dal telefono: Google l'ha accettato, ma Supabase non è
    // riuscito a usare il codice che Google gli ha dato.
    const testo = spiegaErroreAccesso({ message: 'Unable to exchange external code: 4/0AVGzR1A', code: 'server_error' })
    expect(testo).toMatch(/Riprova/)
    expect(testo).toMatch(/Client Secret/)
    // Il testo originale resta, per cercarlo nei log di Supabase.
    expect(testo).toMatch(/Unable to exchange external code: 4\/0AVGzR1A/)
  })

  it('un errore sconosciuto riporta il messaggio originale, per poterlo cercare', () => {
    expect(spiegaErroreAccesso({ message: 'Unable to exchange external code: 4/0Ab' })).toMatch(
      /Unable to exchange external code: 4\/0Ab/,
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
