import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// «Aggiorna» col server di casa: prima Jellyfin cerca i file nuovi (la
// scansione delle librerie), poi Ciak rilegge l'elenco. Senza, un film appena
// scaricato sul NAS non compariva finché Jellyfin non se ne accorgeva da solo.

const { scansionaCasa } = await import('./jellyfin')

const chiamate: string[] = []
let stati: { State: string; CurrentProgressPercentage?: number; LastExecutionResult?: { EndTimeUtc: string } }[] = []
let rispostaRefresh = 204

beforeEach(() => {
  chiamate.length = 0
  rispostaRefresh = 204
  const dati = new Map([['ciak:jellyfin', JSON.stringify({ url: 'https://casa.ts.net', token: 'TOK', userId: 'u', utente: 'ale' })]])
  vi.stubGlobal('localStorage', { getItem: (k: string) => dati.get(k) ?? null, setItem: () => {}, removeItem: () => {} })
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const p = new URL(url).pathname
    chiamate.push(`${init?.method ?? 'GET'} ${p}`)
    if (p === '/Library/Refresh') return new Response(null, { status: rispostaRefresh })
    if (p === '/ScheduledTasks') {
      const s = stati.shift() ?? { State: 'Idle' }
      return new Response(JSON.stringify([{ Key: 'Altro', State: 'Running' }, { Key: 'RefreshLibrary', ...s }]))
    }
    return new Response('', { status: 404 })
  })
})
afterEach(() => vi.unstubAllGlobals())

const subito = async () => {}

describe('scansionaCasa', () => {
  it('fa partire la scansione e aspetta che finisca, dicendo a che punto è', async () => {
    stati = [{ State: 'Running', CurrentProgressPercentage: 20 }, { State: 'Running', CurrentProgressPercentage: 80 }, { State: 'Idle' }]
    const visti: (number | null)[] = []
    expect(await scansionaCasa((p) => visti.push(p), { attendi: subito })).toBe('fatta')
    expect(chiamate).toEqual(['POST /Library/Refresh', 'GET /ScheduledTasks', 'GET /ScheduledTasks', 'GET /ScheduledTasks'])
    expect(visti).toEqual([20, 80])
  })

  it('una scansione già finita quando si guarda (librerie piccole) non fa aspettare', async () => {
    stati = [{ State: 'Idle', LastExecutionResult: { EndTimeUtc: new Date(Date.now() + 1000).toISOString() } }]
    expect(await scansionaCasa(() => {}, { attendi: subito })).toBe('fatta')
    expect(chiamate.filter((c) => c === 'GET /ScheduledTasks')).toHaveLength(1)
  })

  it('un utente che non è amministratore non può chiederla: si rilegge e basta', async () => {
    rispostaRefresh = 403
    expect(await scansionaCasa(() => {}, { attendi: subito })).toBe('non-permessa')
    expect(chiamate).toEqual(['POST /Library/Refresh'])
  })

  it('non aspetta all’infinito una scansione lunga', async () => {
    stati = Array.from({ length: 1000 }, () => ({ State: 'Running', CurrentProgressPercentage: 50 }))
    expect(await scansionaCasa(() => {}, { attendi: subito, volte: 5 })).toBe('ancora-in-corso')
    expect(chiamate.filter((c) => c === 'GET /ScheduledTasks')).toHaveLength(5)
  })
})
