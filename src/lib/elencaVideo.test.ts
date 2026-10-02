import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// L'elenco della cartella Ciak, con un Drive finto: un albero di cartelle
// (id → figli) e nessun video. Conta solo se l'elenco dice di essere completo.
function driveFinto(albero: Record<string, string[]>) {
  return vi.fn(async (url: string) => {
    const q = new URL(url).searchParams.get('q') ?? ''
    let files: { id: string; name: string; parents?: string[] }[] = []
    if (q.includes("'root' in parents")) files = [{ id: 'ciak', name: 'Ciak' }]
    else if (q.includes("mimeType = 'application/vnd.google-apps.folder'")) {
      for (const [padre, figli] of Object.entries(albero)) {
        if (q.includes(`'${padre}' in parents`)) files.push(...figli.map((id) => ({ id, name: id.toUpperCase(), parents: [padre] })))
      }
    }
    return new Response(JSON.stringify({ files }), { status: 200 })
  })
}

describe('elencaVideo: un elenco troncato lo dice', () => {
  beforeEach(() => {
    vi.resetModules()
    const sessione = new Map([['ciak:drive-token', JSON.stringify({ t: 'token', e: Date.now() + 3_600_000 })]])
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => sessione.get(k) ?? null,
      setItem: (k: string, v: string) => void sessione.set(k, v),
      removeItem: (k: string) => void sessione.delete(k),
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('tutte le cartelle visitate: completo', async () => {
    vi.stubGlobal('fetch', driveFinto({ ciak: ['film', 'serie'], serie: ['southpark'], southpark: ['s01'] }))
    const { elencaVideo } = await import('./googleDrive')
    expect((await elencaVideo()).completo).toBe(true)
  })

  it('cartelle più profonde del limite: non completo, e chi lo usa per togliere pulsanti non deve farlo', async () => {
    vi.stubGlobal('fetch', driveFinto({ ciak: ['a'], a: ['b'], b: ['c'], c: ['d'], d: ['e'], e: ['f'] }))
    const { elencaVideo } = await import('./googleDrive')
    expect((await elencaVideo()).completo).toBe(false)
  })

  it('più cartelle del tetto: non completo', async () => {
    vi.stubGlobal('fetch', driveFinto({ ciak: Array.from({ length: 250 }, (_, i) => `c${i}`) }))
    const { elencaVideo } = await import('./googleDrive')
    expect((await elencaVideo()).completo).toBe(false)
  })
})
