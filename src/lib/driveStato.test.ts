import { describe, expect, it } from 'vitest'
import {
  DURATA_STATO_MS,
  firmaStato,
  indirizzoRitorno,
  origineRichiesta,
  percorsoSicuro,
  statoClienteValido,
  urlConsensoServer,
  verificaStato,
} from './driveStato'

const DATI = { u: 'utente-1', c: `ciak-drive-${'a'.repeat(32)}`, r: '/streaming/video-1', o: 'https://ciak.vercel.app', e: 1_000_000 + DURATA_STATO_MS }

describe('lo state firmato', () => {
  it('torna com era partito, finché non scade', () => {
    const stato = firmaStato(DATI, 'segreto')
    expect(verificaStato(stato, 'segreto', 1_000_000)).toEqual(DATI)
    expect(verificaStato(stato, 'segreto', DATI.e + 1)).toBeNull()
  })

  it('cambiato per strada, o firmato con un altro segreto, non vale', () => {
    const stato = firmaStato(DATI, 'segreto')
    const [corpo, firma] = stato.split('.')
    const altro = Buffer.from(JSON.stringify({ ...DATI, u: 'utente-2' })).toString('base64url')
    expect(verificaStato(`${altro}.${firma}`, 'segreto', 1_000_000)).toBeNull()
    expect(verificaStato(stato, 'altro-segreto', 1_000_000)).toBeNull()
    expect(verificaStato(corpo, 'segreto', 1_000_000)).toBeNull()
    expect(verificaStato(undefined, 'segreto', 1_000_000)).toBeNull()
    expect(verificaStato(stato, '', 1_000_000)).toBeNull()
  })

  it('un percorso di ritorno strano diventa la videoteca', () => {
    const stato = firmaStato({ ...DATI, r: '//altro.sito' }, 'segreto')
    expect(verificaStato(stato, 'segreto', 1_000_000)?.r).toBe('/streaming')
    expect(percorsoSicuro('/streaming/x')).toBe('/streaming/x')
    expect(percorsoSicuro('https://altro')).toBe('/streaming')
    expect(percorsoSicuro('/x#y')).toBe('/streaming')
  })
})

describe('il giro da Google', () => {
  it('lo state del browser si accetta solo nella sua forma', () => {
    expect(statoClienteValido(`ciak-drive-${'0'.repeat(32)}`)).toBe(true)
    expect(statoClienteValido('ciak-drive-abc')).toBe(false)
    expect(statoClienteValido('javascript:x')).toBe(false)
  })

  it('l origine viene dal proxy di Vercel, https se non detto', () => {
    expect(origineRichiesta({ host: 'ciak.vercel.app' })).toBe('https://ciak.vercel.app')
    expect(origineRichiesta({ 'x-forwarded-host': 'ciak.vercel.app', 'x-forwarded-proto': 'https', host: 'interno' })).toBe('https://ciak.vercel.app')
    expect(origineRichiesta({ host: 'localhost:3000', 'x-forwarded-proto': 'http' })).toBe('http://localhost:3000')
    expect(origineRichiesta({ host: 'strano/host' })).toBeNull()
    expect(origineRichiesta(undefined)).toBeNull()
  })

  it('il consenso chiede un codice e il permesso permanente', () => {
    const u = new URL(urlConsensoServer('id-cliente', 'https://ciak.vercel.app', 'S'))
    expect(u.origin + u.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(u.searchParams.get('response_type')).toBe('code')
    expect(u.searchParams.get('access_type')).toBe('offline')
    expect(u.searchParams.get('prompt')).toBe('consent')
    expect(u.searchParams.get('redirect_uri')).toBe('https://ciak.vercel.app/api/drive-callback')
    expect(u.searchParams.get('state')).toBe('S')
    expect(u.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/drive')
  })

  it('il ritorno ha la stessa forma del vecchio consenso, col token nel frammento', () => {
    expect(indirizzoRitorno(DATI, { token: 'tok', secondi: 3599 })).toBe(
      `https://ciak.vercel.app/streaming/video-1#access_token=tok&token_type=Bearer&expires_in=3599&state=${DATI.c}`,
    )
    expect(indirizzoRitorno(DATI, { errore: 'access_denied' })).toBe(`https://ciak.vercel.app/streaming/video-1#error=access_denied&state=${DATI.c}`)
  })
})
