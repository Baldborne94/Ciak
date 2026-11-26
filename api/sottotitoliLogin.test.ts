import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Il login a OpenSubtitles alza solo il tetto dei download: se non riesce, i
// sottotitoli si scaricano lo stesso con la chiave. Prima un login rifiutato
// faceva fallire tutto («Accesso a OpenSubtitles non riuscito (429)»), e il
// lettore chiede italiano e inglese insieme: due login nello stesso istante,
// quando OpenSubtitles ne accetta uno al secondo.

process.env.OPENSUBTITLES_USERNAME = 'utente'
process.env.OPENSUBTITLES_PASSWORD = 'segreta'
process.env.OPENSUBTITLES_API_KEY = 'chiave'

const { accedi, dimenticaSessione } = await import('./sottotitoli')

let login: number
function rete(rispostaLogin: () => Response) {
  vi.stubGlobal('fetch', async (url: string) => {
    if (String(url).endsWith('/login')) {
      login++
      await new Promise((r) => setTimeout(r, 10))
      return rispostaLogin()
    }
    return new Response('{}')
  })
}

beforeEach(() => {
  login = 0
  dimenticaSessione()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('accedi', () => {
  it('due richieste insieme fanno un login solo', async () => {
    rete(() => Response.json({ token: 'tok', base_url: 'vip-api.opensubtitles.com' }))
    const [a, b] = await Promise.all([accedi(), accedi()])
    expect(login).toBe(1)
    expect(a).toEqual(b)
    expect(a?.token).toBe('tok')
  })

  it('un login rifiutato non ferma il download, e non si ritenta a raffica', async () => {
    rete(() => new Response('{}', { status: 429 }))
    expect(await accedi()).toBeNull()
    expect(await accedi()).toBeNull()
    expect(login).toBe(1)
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/429/))
  })
})
