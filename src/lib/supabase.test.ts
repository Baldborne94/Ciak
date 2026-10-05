import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { creaClient } from './supabase'

// Il client montato a mano deve comportarsi come `createClient` in ciò che
// conta: lo si confronta col vero, non con un'idea di come funziona.
const URL_PROGETTO = 'https://abcdefgh.supabase.co'
const CHIAVE = 'chiave-anonima'

afterEach(() => vi.unstubAllGlobals())
// Node 20 (quello della CI) non ha WebSocket: lo si toglie anche qui, perché il
// test si comporti uguale su ogni macchina.
beforeEach(() => vi.stubGlobal('WebSocket', undefined))

// Il createClient vero, termine di paragone. Costruisce sempre anche realtime,
// che senza WebSocket si ferma: gli si dà un trasporto finto, mai usato qui.
const vero = () => createClient(URL_PROGETTO, CHIAVE, { realtime: { transport: class {} as never } })

// Le intestazioni e l'indirizzo di una richiesta alla tabella, da un client.
async function richiesta(client: { from: (t: string) => { select: (c: string) => PromiseLike<unknown> } }) {
  const chiamate: { url: string; headers: Headers }[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      chiamate.push({ url: String(input), headers: new Headers(init?.headers) })
      return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })
    }),
  )
  await client.from('user_titles').select('*')
  return chiamate[0]
}

describe('il client di Supabase montato a mano', () => {
  it('salva la sessione sotto la stessa chiave di supabase-js: chi è già entrato resta dentro', () => {
    const nostro = creaClient(URL_PROGETTO, CHIAVE)
    const chiave = (c: unknown) => (c as { storageKey: string }).storageKey
    expect(chiave(nostro.auth)).toBe('sb-abcdefgh-auth-token')
    expect(chiave(nostro.auth)).toBe(chiave(vero().auth))
  })

  it('chiede le tabelle allo stesso indirizzo e con la stessa chiave di supabase-js', async () => {
    const vera = await richiesta(vero())
    const nostra = await richiesta(creaClient(URL_PROGETTO, CHIAVE))
    expect(nostra.url).toBe(vera.url)
    expect(nostra.headers.get('apikey')).toBe(CHIAVE)
    // Senza sessione vale la chiave anonima, come in supabase-js.
    expect(nostra.headers.get('Authorization')).toBe(`Bearer ${CHIAVE}`)
    expect(nostra.headers.get('Authorization')).toBe(vera.headers.get('Authorization'))
  })

  it('con una sessione manda il token dell utente, non la chiave anonima', async () => {
    const client = creaClient(URL_PROGETTO, CHIAVE)
    vi.spyOn(client.auth, 'getSession').mockResolvedValue({
      data: { session: { access_token: 'token-utente' } as never },
      error: null,
    })
    const r = await richiesta(client)
    expect(r.headers.get('Authorization')).toBe('Bearer token-utente')
  })
})
