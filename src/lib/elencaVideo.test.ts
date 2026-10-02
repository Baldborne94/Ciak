import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// L'elenco della cartella Ciak, con un Drive finto: un albero di cartelle
// (id → figli) e un video dentro le cartelle indicate.
function driveFinto(albero: Record<string, string[]>, conVideo: string[]) {
  return vi.fn(async (url: string) => {
    const q = new URL(url).searchParams.get('q') ?? ''
    let files: { id: string; name: string; parents?: string[]; mimeType?: string }[] = []
    if (q.includes("'root' in parents")) files = [{ id: 'ciak', name: 'Ciak' }]
    else if (q.includes("mimeType = 'application/vnd.google-apps.folder'")) {
      for (const [padre, figli] of Object.entries(albero)) {
        if (q.includes(`'${padre}' in parents`)) files.push(...figli.map((id) => ({ id, name: id.toUpperCase(), parents: [padre] })))
      }
    } else if (q.includes("mimeType contains 'video/'")) {
      files = conVideo
        .filter((cartella) => q.includes(`'${cartella}' in parents`))
        .map((cartella) => ({ id: `video-${cartella}`, name: `${cartella}.mp4`, mimeType: 'video/mp4', parents: [cartella] }))
    }
    return new Response(JSON.stringify({ files }), { status: 200 })
  })
}

const idVideo = async () => {
  const { elencaVideo } = await import('./googleDrive')
  return (await elencaVideo()).video.map((v) => v.id).sort()
}

// Prima c'erano un tetto di 4 livelli e di 200 cartelle: con una stagione per
// cartella, una videoteca che cresce lo superava e i video oltre sparivano
// dall'elenco senza dirlo.
describe('elencaVideo visita tutte le cartelle', () => {
  beforeEach(() => {
    vi.resetModules()
    // Il permesso di Drive sta sul dispositivo, non nella scheda.
    const dispositivo = new Map([['ciak:drive-token', JSON.stringify({ t: 'token', e: Date.now() + 3_600_000 })]])
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => dispositivo.get(k) ?? null,
      setItem: (k: string, v: string) => void dispositivo.set(k, v),
      removeItem: (k: string) => void dispositivo.delete(k),
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('a qualsiasi profondità: SERIE TV/South Park/Raccolta/Season 02 e oltre', async () => {
    vi.stubGlobal('fetch', driveFinto({ ciak: ['a'], a: ['b'], b: ['c'], c: ['d'], d: ['e'], e: ['f'], f: ['g'] }, ['g']))
    expect(await idVideo()).toEqual(['video-g'])
  })

  it('in qualsiasi numero: anche la duecentocinquantesima cartella', async () => {
    const tante = Array.from({ length: 250 }, (_, i) => `c${i}`)
    vi.stubGlobal('fetch', driveFinto({ ciak: tante }, ['c0', 'c249']))
    expect(await idVideo()).toEqual(['video-c0', 'video-c249'])
  })
})
