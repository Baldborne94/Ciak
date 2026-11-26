import { describe, expect, it } from 'vitest'
import { createHmac, createPrivateKey, createPublicKey, sign, verify, webcrypto } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// nas/chiavi.html prepara il .env del NAS sul PC dell'utente. Qui si provano
// le sue funzioni (lette dal file, come fa il test del service worker) e si
// controlla che il .env porti ogni variabile che docker-compose.yaml chiede.

const html = readFileSync(resolve(__dirname, '../../nas/chiavi.html'), 'utf8')
const script = /<script>([\s\S]*?)<\/script>/.exec(html)![1]

interface Chiavi {
  conVapid: (crypto: Crypto, campi: Record<string, string>) => Promise<Record<string, string>>
  segreti: (crypto: Crypto, adesso: number) => Promise<Record<string, string>>
  componi: (campi: Record<string, string>, segreti: Record<string, string>) => string
}
const Chiavi = new Function('document', `${script}; return Chiavi`)(undefined) as Chiavi

const parti = (jwt: string) => jwt.split('.')
const leggi = (pezzo: string) => JSON.parse(Buffer.from(pezzo, 'base64url').toString())

describe('chiavi.html', () => {
  it('le chiavi di Supabase sono JWT firmati col segreto del login', async () => {
    const s = await Chiavi.segreti(webcrypto as unknown as Crypto, Date.UTC(2026, 10, 26))
    for (const [chiave, ruolo] of [
      ['ANON_KEY', 'anon'],
      ['SERVICE_ROLE_KEY', 'service_role'],
    ] as const) {
      const [testa, corpo, firma] = parti(s[chiave])
      expect(leggi(testa)).toEqual({ alg: 'HS256', typ: 'JWT' })
      expect(leggi(corpo)).toMatchObject({ role: ruolo, iss: 'supabase' })
      expect(leggi(corpo).exp - leggi(corpo).iat).toBeGreaterThan(9 * 365 * 24 * 3600)
      // La firma la verificano login e tabelle col segreto: si rifà a mano.
      expect(firma).toBe(createHmac('sha256', s.JWT_SECRET).update(`${testa}.${corpo}`).digest('base64url'))
    }
  })

  it('le password sono lunghe, diverse ogni volta, e senza caratteri che rompono un indirizzo', async () => {
    const a = await Chiavi.segreti(webcrypto as unknown as Crypto, 0)
    const b = await Chiavi.segreti(webcrypto as unknown as Crypto, 0)
    expect(a.POSTGRES_PASSWORD).toMatch(/^[0-9a-f]{48}$/)
    expect(a.JWT_SECRET.length).toBeGreaterThanOrEqual(32)
    expect(a.POSTGRES_PASSWORD).not.toBe(b.POSTGRES_PASSWORD)
    expect(a.JWT_SECRET).not.toBe(b.JWT_SECRET)
  })

  it('il .env porta ogni variabile senza valore predefinito di docker-compose.yaml', async () => {
    const compose = readFileSync(resolve(__dirname, '../../nas/docker-compose.yaml'), 'utf8')
    const richieste = [...compose.matchAll(/\$\{([A-Z_]+)\}/g)].map((m) => m[1])
    const testo = Chiavi.componi({ INDIRIZZO_PUBBLICO: 'https://nas.esempio.ts.net:8443/', TMDB_API_KEY: ' tmdb ' }, await Chiavi.segreti(webcrypto as unknown as Crypto, 0))
    const definite = new Set([...testo.matchAll(/^([A-Z_]+)=/gm)].map((m) => m[1]))
    expect([...new Set(richieste)].filter((r) => !definite.has(r))).toEqual([])
    // Senza la barra in fondo (finirebbe in «…:8443//auth/v1») e senza spazi.
    expect(testo).toContain('INDIRIZZO_PUBBLICO=https://nas.esempio.ts.net:8443\n')
    expect(testo).toContain('TMDB_API_KEY=tmdb\n')
  })

  it('una password con «$» o «#» resta com’è, fra apici', () => {
    const testo = Chiavi.componi({ OPENSUBTITLES_PASSWORD: 'ab$c#1' }, {})
    expect(testo).toContain("OPENSUBTITLES_PASSWORD='ab$c#1'\n")
  })

  it('senza chiavi delle notifiche ne crea una coppia nel formato di web-push', async () => {
    const campi = await Chiavi.conVapid(webcrypto as unknown as Crypto, { VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '' })
    expect(Buffer.from(campi.VAPID_PUBLIC_KEY, 'base64url')).toHaveLength(65)
    expect(Buffer.from(campi.VAPID_PRIVATE_KEY, 'base64url')).toHaveLength(32)
    // Le due metà sono della stessa coppia: una firma della privata si
    // verifica con la pubblica (le lunghezze sono quelle che web-push chiede).
    const pub = Buffer.from(campi.VAPID_PUBLIC_KEY, 'base64url')
    const jwk = { kty: 'EC', crv: 'P-256', x: pub.subarray(1, 33).toString('base64url'), y: pub.subarray(33).toString('base64url') }
    const firma = sign('sha256', Buffer.from('ciak'), createPrivateKey({ key: { ...jwk, d: campi.VAPID_PRIVATE_KEY }, format: 'jwk' }))
    expect(verify('sha256', Buffer.from('ciak'), createPublicKey({ key: jwk, format: 'jwk' }), firma)).toBe(true)
  })

  it('chiavi delle notifiche scritte a mano restano quelle', async () => {
    const campi = await Chiavi.conVapid(webcrypto as unknown as Crypto, { VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv' })
    expect([campi.VAPID_PUBLIC_KEY, campi.VAPID_PRIVATE_KEY]).toEqual(['pub', 'priv'])
  })
})
