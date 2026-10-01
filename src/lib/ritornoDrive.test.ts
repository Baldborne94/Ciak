import { describe, it, expect } from 'vitest'
import { leggiRispostaGoogle } from './ritornoDrive'
import { urlConsensoDrive } from './googleDrive'

const ORA = 1_000_000
const STATO = 'ciak-drive-abc123'

describe('ritorno da Google nell app installata', () => {
  it('prende il token e lo fa scadere con margine', () => {
    const r = leggiRispostaGoogle(`#state=${STATO}&access_token=tok&expires_in=3599&token_type=Bearer`, STATO, ORA)
    expect(r).toEqual({ token: 'tok', scadenza: ORA + (3599 - 120) * 1000 })
  })

  it('lascia stare i frammenti che non sono suoi (per esempio un login di Supabase)', () => {
    expect(leggiRispostaGoogle('#access_token=supabase&refresh_token=x', STATO, ORA)).toBeNull()
    expect(leggiRispostaGoogle('#state=altro&access_token=x', STATO, ORA)).toBeNull()
    expect(leggiRispostaGoogle('', STATO, ORA)).toBeNull()
  })

  it('rifiuta un token con uno state diverso da quello partito da qui', () => {
    const r = leggiRispostaGoogle('#state=ciak-drive-forgiato&access_token=rubato', STATO, ORA)
    expect(r).toEqual({ errore: expect.stringMatching(/non riconosciuta/) })
    // Anche se la scheda non aspettava nessun ritorno.
    expect(leggiRispostaGoogle(`#state=${STATO}&access_token=x`, null, ORA)).toEqual({
      errore: expect.stringMatching(/non riconosciuta/),
    })
  })

  it('traduce il rifiuto e gli altri errori di Google', () => {
    expect(leggiRispostaGoogle(`#state=${STATO}&error=access_denied`, STATO, ORA)).toEqual({
      errore: 'Accesso a Google Drive negato.',
    })
    expect(leggiRispostaGoogle(`#state=${STATO}&error=server_error`, STATO, ORA)).toEqual({
      errore: 'Google ha risposto: server_error',
    })
    expect(leggiRispostaGoogle(`#state=${STATO}`, STATO, ORA)).toEqual({ errore: expect.stringMatching(/permesso/) })
  })
})

describe('urlConsensoDrive', () => {
  it('chiede lo stesso permesso del popup, col token nel ritorno', () => {
    const u = new URL(urlConsensoDrive('id-client', 'https://ciak.example/streaming', STATO))
    expect(u.origin + u.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(u.searchParams.get('client_id')).toBe('id-client')
    expect(u.searchParams.get('redirect_uri')).toBe('https://ciak.example/streaming')
    expect(u.searchParams.get('response_type')).toBe('token')
    expect(u.searchParams.get('state')).toBe(STATO)
    expect(u.searchParams.get('scope')?.split(' ')).toEqual([
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/drive.file',
    ])
  })
})
