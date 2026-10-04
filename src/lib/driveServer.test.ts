import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dimenticaSulServer, interpretaRinnovo, rinnovaDalServer, urlConsensoDalServer } from './driveServer'

// La sessione di Ciak: c'è, con un token da passare al server.
vi.mock('./supabase', () => ({
  supabase: { auth: { getSession: () => Promise.resolve({ data: { session: { access_token: 'jwt-ciak' } } }) } },
}))

const risposte: { stato: number; corpo: string }[] = []
const chiamate: { url: string; init: RequestInit }[] = []
beforeEach(() => {
  risposte.length = 0
  chiamate.length = 0
  vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
    chiamate.push({ url, init })
    const r = risposte.shift() ?? { stato: 200, corpo: '<!doctype html><html></html>' }
    return Promise.resolve(new Response(r.corpo, { status: r.stato }))
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('interpretaRinnovo', () => {
  it('un token nuovo, con la scadenza un po prima dell ora', () => {
    expect(interpretaRinnovo({ stato: 200, dati: { access_token: 'tok', expires_in: 3600 } }, 1000)).toEqual({
      stato: 'rinnovato',
      token: 'tok',
      scadenza: 1000 + 3480 * 1000,
    })
  })

  it('404: il server c è ma non ha il permesso; tutto il resto: niente server', () => {
    expect(interpretaRinnovo({ stato: 404, dati: { error: 'x' } }, 0)).toEqual({ stato: 'non-collegato' })
    expect(interpretaRinnovo({ stato: 503, dati: { error: 'x' } }, 0)).toEqual({ stato: 'non-disponibile' })
    expect(interpretaRinnovo({ stato: 200, dati: {} }, 0)).toEqual({ stato: 'non-disponibile' })
    expect(interpretaRinnovo(null, 0)).toEqual({ stato: 'non-disponibile' })
  })
})

describe('le chiamate al server', () => {
  it('il rinnovo porta la sessione di Ciak e legge il token', async () => {
    risposte.push({ stato: 200, corpo: JSON.stringify({ access_token: 'tok', expires_in: 3599 }) })
    const esito = await rinnovaDalServer()
    expect(esito.stato).toBe('rinnovato')
    expect(chiamate[0].url).toBe('/api/drive?azione=token')
    expect(chiamate[0].init.method).toBe('POST')
    expect((chiamate[0].init.headers as Record<string, string>).Authorization).toBe('Bearer jwt-ciak')
  })

  it('la pagina al posto del JSON (anteprima, dev server) vale come niente server', async () => {
    expect(await rinnovaDalServer()).toEqual({ stato: 'non-disponibile' })
    expect(await urlConsensoDalServer('ciak-drive-x', '/streaming')).toBeNull()
  })

  it('il consenso: solo un indirizzo di Google, e solo dal server', async () => {
    risposte.push({ stato: 200, corpo: JSON.stringify({ url: 'https://accounts.google.com/o/oauth2/v2/auth?x=1' }) })
    expect(await urlConsensoDalServer('ciak-drive-x', '/streaming/v1')).toBe('https://accounts.google.com/o/oauth2/v2/auth?x=1')
    expect(JSON.parse(chiamate[0].init.body as string)).toEqual({ stato: 'ciak-drive-x', ritorno: '/streaming/v1' })
    risposte.push({ stato: 200, corpo: JSON.stringify({ url: 'https://altro.sito/' }) })
    expect(await urlConsensoDalServer('ciak-drive-x', '/streaming')).toBeNull()
    risposte.push({ stato: 503, corpo: JSON.stringify({ error: 'non configurato' }) })
    expect(await urlConsensoDalServer('ciak-drive-x', '/streaming')).toBeNull()
  })

  it('scollegare toglie il permesso anche dal server', async () => {
    risposte.push({ stato: 200, corpo: JSON.stringify({ ok: true }) })
    await dimenticaSulServer()
    expect(chiamate[0]).toMatchObject({ url: '/api/drive?azione=token', init: { method: 'DELETE' } })
  })
})
