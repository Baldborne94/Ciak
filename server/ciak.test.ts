import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import { gunzipSync } from 'node:zlib'
import { conConfigurazione, creaServer, msAllaProssima, queryDa, type Funzione, type OpzioniServer } from './ciak'

// Il server di Ciak sul NAS: l'app, le funzioni di api/ con la forma di
// Vercel, e il cancello verso Supabase. Si prova con un server vero su una
// porta a caso e un finto Supabase accanto.

let cartella: string
const aperti: Server[] = []

async function avvia(server: Server): Promise<string> {
  aperti.push(server)
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok))
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

function ciak(opzioni: Partial<OpzioniServer> = {}) {
  return avvia(creaServer({ cartella, funzioni: {}, registra: () => {}, ...opzioni }))
}

beforeEach(() => {
  cartella = mkdtempSync(join(tmpdir(), 'ciak-dist-'))
  writeFileSync(join(cartella, 'index.html'), '<!doctype html><html><head><title>Ciak</title></head><body></body></html>')
  mkdirSync(join(cartella, 'assets'))
  writeFileSync(join(cartella, 'assets', 'index-abc123.js'), `console.log(${JSON.stringify('x'.repeat(5000))})`)
  writeFileSync(join(cartella, 'versione.json'), '{"versione":"1"}')
})

afterEach(async () => {
  await Promise.all(aperti.splice(0).map((s) => new Promise((ok) => s.close(ok))))
  rmSync(cartella, { recursive: true, force: true })
})

describe('l’app', () => {
  it('una pagina dell’app è index.html, con la configurazione per il browser', async () => {
    const base = await ciak({ configurazione: { supabaseAnonKey: 'anon</script>', vapidPublicKey: 'vapid' } })
    const r = await fetch(`${base}/film/603`)
    expect(r.status).toBe(200)
    expect(r.headers.get('content-type')).toBe('text/html; charset=utf-8')
    const html = await r.text()
    expect(html).toContain('<script>window.__CIAK__={"supabaseAnonKey":"anon\\u003c/script>","vapidPublicKey":"vapid"}</script></head>')
    // index.html si chiede sempre di nuovo: dentro c'è la versione dell'app.
    expect(r.headers.get('cache-control')).toBe('no-cache')
  })

  it('i file con l’impronta nel nome restano in cache per sempre, compressi', async () => {
    const base = await ciak()
    const r = await fetch(`${base}/assets/index-abc123.js`, { headers: { 'accept-encoding': 'gzip' } })
    expect(r.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
    expect(r.headers.get('content-type')).toBe('text/javascript; charset=utf-8')
    // fetch decomprime da sé: il testo è quello del file.
    expect(await r.text()).toContain('xxxx')
    expect(r.headers.get('content-encoding')).toBe('gzip')
  })

  it('un file che non c’è sotto /assets non si tiene in cache come se ci fosse', async () => {
    const base = await ciak()
    const r = await fetch(`${base}/assets/vecchio-999.js`)
    expect(r.headers.get('cache-control')).toBe('no-cache')
  })

  it('versione.json si chiede sempre alla rete', async () => {
    const base = await ciak()
    const r = await fetch(`${base}/versione.json`)
    expect(await r.json()).toEqual({ versione: '1' })
    expect(r.headers.get('cache-control')).toBe('no-cache')
  })

  it('un «../» non esce dalla cartella dell’app', async () => {
    writeFileSync(join(cartella, '..', 'segreto-ciak.txt'), 'segreto')
    const base = await ciak()
    // fetch normalizza i «..» nell'indirizzo: si scrivono codificati.
    const html = await (await fetch(`${base}/%2e%2e/segreto-ciak.txt`)).text()
    expect(html).not.toContain('segreto')
    rmSync(join(cartella, '..', 'segreto-ciak.txt'))
  })
})

describe('le funzioni di api/', () => {
  it('ricevono query, intestazioni e il JSON già letto, come su Vercel', async () => {
    let vista: Parameters<Funzione>[0] | undefined
    const eco: Funzione = (req, res) => {
      vista = req
      res.setHeader('Cache-Control', 'no-store')
      res.status(201).json({ ok: true })
    }
    const base = await ciak({ funzioni: { eco } })
    const r = await fetch(`${base}/api/eco?path=/movie/1&id=1&id=2`, {
      method: 'POST',
      headers: { Authorization: 'Bearer tok', 'Content-Type': 'application/json' },
      body: JSON.stringify({ azione: 'cerca' }),
    })
    expect(r.status).toBe(201)
    expect(await r.json()).toEqual({ ok: true })
    expect(r.headers.get('cache-control')).toBe('no-store')
    expect(vista?.method).toBe('POST')
    expect(vista?.query).toEqual({ path: '/movie/1', id: ['1', '2'] })
    expect(vista?.headers.authorization).toBe('Bearer tok')
    expect(vista?.body).toEqual({ azione: 'cerca' })
  })

  it('una funzione che si rompe risponde 500, e il server resta su', async () => {
    const base = await ciak({
      funzioni: {
        rotta: () => {
          throw new Error('boom')
        },
        muta: () => {},
      },
    })
    expect((await fetch(`${base}/api/rotta`)).status).toBe(500)
    expect((await fetch(`${base}/api/muta`)).status).toBe(500)
    expect((await fetch(`${base}/api/sconosciuta`)).status).toBe(404)
    // Non una proprietà qualunque dell'oggetto delle funzioni.
    expect((await fetch(`${base}/api/toString`)).status).toBe(404)
  })

  it('un corpo troppo grande o un JSON rotto non arrivano alla funzione', async () => {
    let chiamate = 0
    const base = await ciak({ funzioni: { f: (_q, r) => void (chiamate++, r.json({})) }, limiteCorpo: 100 })
    const grande = await fetch(`${base}/api/f`, { method: 'POST', body: 'x'.repeat(1000) }).catch(() => null)
    expect(grande === null || grande.status === 413).toBe(true)
    const rotto = await fetch(`${base}/api/f`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' })
    expect(rotto.status).toBe(400)
    expect(chiamate).toBe(0)
  })
})

describe('il cancello verso Supabase', () => {
  async function finto() {
    const viste: { url?: string; method?: string; headers: Record<string, unknown>; corpo: string }[] = []
    const base = await avvia(
      createServer((req, res) => {
        let corpo = ''
        req.on('data', (p) => (corpo += p))
        req.on('end', () => {
          viste.push({ url: req.url, method: req.method, headers: req.headers, corpo })
          res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Range': '0-0/1' })
          res.end('[{"version":24}]')
        })
      }),
    )
    return { base, viste }
  }

  it('inoltra tabelle e login senza il prefisso, con intestazioni e corpo', async () => {
    const rest = await finto()
    const auth = await finto()
    const base = await ciak({ supabase: { auth: auth.base, rest: rest.base }, chiaviApi: ['ANON'] })

    const r = await fetch(`${base}/rest/v1/schema_version?select=version&order=version.desc`, {
      headers: { apikey: 'ANON', Authorization: 'Bearer utente', Prefer: 'count=exact' },
    })
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual([{ version: 24 }])
    expect(r.headers.get('content-range')).toBe('0-0/1')
    expect(rest.viste[0].url).toBe('/schema_version?select=version&order=version.desc')
    expect(rest.viste[0].headers.authorization).toBe('Bearer utente')
    expect(rest.viste[0].headers.prefer).toBe('count=exact')

    await fetch(`${base}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: 'ANON', 'Content-Type': 'application/json' },
      body: '{"email":"a@b.c","password":"x"}',
    })
    expect(auth.viste[0]).toMatchObject({ url: '/token?grant_type=password', method: 'POST', corpo: '{"email":"a@b.c","password":"x"}' })
  })

  it('senza la chiave giusta non si passa, tranne le pagine aperte dai link', async () => {
    const rest = await finto()
    const auth = await finto()
    const base = await ciak({ supabase: { auth: auth.base, rest: rest.base }, chiaviApi: ['ANON'] })
    expect((await fetch(`${base}/rest/v1/user_ratings`)).status).toBe(401)
    expect((await fetch(`${base}/rest/v1/user_ratings`, { headers: { apikey: 'ALTRA' } })).status).toBe(401)
    expect((await fetch(`${base}/auth/v1/signup`, { method: 'POST', body: '{}' })).status).toBe(401)
    expect(rest.viste).toHaveLength(0)
    expect((await fetch(`${base}/auth/v1/verify?token=t&type=recovery`)).status).toBe(200)
    expect(auth.viste.map((v) => v.url)).toEqual(['/verify?token=t&type=recovery'])
  })

  it('con Supabase spento lo dice, invece di restare appeso', async () => {
    const base = await ciak({ supabase: { auth: 'http://127.0.0.1:9', rest: 'http://127.0.0.1:9' }, chiaviApi: ['ANON'] })
    const r = await fetch(`${base}/rest/v1/x`, { headers: { apikey: 'ANON' } })
    expect(r.status).toBe(502)
    expect(((await r.json()) as { message: string }).message).toMatch(/NAS/)
  })
})

describe('pezzi', () => {
  it('queryDa tiene i valori ripetuti in un elenco', () => {
    expect(queryDa(new URL('http://x/?a=1&b=2&a=3'))).toEqual({ a: ['1', '3'], b: '2' })
  })

  it('senza configurazione index.html resta com’è', () => {
    expect(conConfigurazione('<head></head>', undefined)).toBe('<head></head>')
  })

  it('il controllo delle uscite parte alle 9 UTC, oggi o domani', () => {
    expect(msAllaProssima(new Date('2026-11-25T08:00:00Z'), 9)).toBe(3600_000)
    expect(msAllaProssima(new Date('2026-11-25T09:00:00Z'), 9)).toBe(24 * 3600_000)
    expect(msAllaProssima(new Date('2026-11-25T22:30:00Z'), 9)).toBe(10.5 * 3600_000)
  })
})

it('il file compresso è proprio il file', async () => {
  const base = await ciak()
  const { request } = await import('node:http')
  const byte = await new Promise<Buffer>((ok) => {
    request(`${base}/assets/index-abc123.js`, { headers: { 'accept-encoding': 'gzip' } }, (r) => {
      const pezzi: Buffer[] = []
      r.on('data', (p) => pezzi.push(p))
      r.on('end', () => ok(Buffer.concat(pezzi)))
    }).end()
  })
  expect(gunzipSync(byte).toString()).toContain('console.log')
})
