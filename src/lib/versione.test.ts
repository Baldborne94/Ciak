import { describe, it, expect, vi } from 'vitest'
import { eNuova, versionePubblicata } from './versione'

vi.mock('./logFailure', () => ({ logFailure: () => () => {} }))

describe('versione', () => {
  it('è nuova solo se diversa, conosciuta, e non in sviluppo', () => {
    expect(eNuova('abc', 'def')).toBe(true)
    expect(eNuova('abc', 'abc')).toBe(false)
    expect(eNuova('abc', null)).toBe(false)
    expect(eNuova('dev', 'def')).toBe(false)
  })

  it('legge versione.json scavalcando la cache', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ versione: 'def456' })))
    expect(await versionePubblicata(fetcher)).toBe('def456')
    const [url, init] = fetcher.mock.calls[0]
    expect(url).toMatch(/^\/versione\.json\?t=\d+$/)
    expect(init).toEqual({ cache: 'no-store' })
  })

  it('senza rete o senza file non sa niente, e non si rompe', async () => {
    expect(await versionePubblicata(vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))).toBeNull()
    expect(await versionePubblicata(vi.fn().mockResolvedValue(new Response('', { status: 404 })))).toBeNull()
    expect(await versionePubblicata(vi.fn().mockResolvedValue(new Response('{"altro":1}')))).toBeNull()
  })
})
