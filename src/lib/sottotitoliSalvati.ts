// I sottotitoli trovati online per un video che non si può scrivere accanto al
// file (browser senza maniglie, film scelto a mano): restano in Ciak, nella
// cache del browser, così la volta dopo non si cercano di nuovo — ogni
// download da OpenSubtitles consuma il tetto giornaliero.

const CACHE = 'ciak-sottotitoli-v1'

const url = (fileId: string, chiave: string) => `/sottotitoli-salvati/${fileId}/${chiave}`

export interface SottotitoloSalvato {
  chiave: string
  lingua: string | null
  testo: string
}

function disponibile(): boolean {
  return typeof caches !== 'undefined'
}

export async function leggiSottotitoliSalvati(fileId: string): Promise<SottotitoloSalvato[]> {
  if (!disponibile()) return []
  const cache = await caches.open(CACHE)
  const chiavi = (await cache.keys()).filter((r) => new URL(r.url).pathname.startsWith(`/sottotitoli-salvati/${fileId}/`))
  return Promise.all(
    chiavi.map(async (r) => {
      const res = await cache.match(r)
      return {
        chiave: new URL(r.url).pathname.split('/').pop() ?? '',
        lingua: res?.headers.get('X-Lingua') || null,
        testo: (await res?.text()) ?? '',
      }
    }),
  )
}

export async function salvaSottotitolo(fileId: string, chiave: string, lingua: string | null, testo: string): Promise<void> {
  if (!disponibile()) return
  await (await caches.open(CACHE)).put(url(fileId, chiave), new Response(testo, { headers: { 'X-Lingua': lingua ?? '' } }))
}

export async function togliSottotitolo(fileId: string, chiave: string): Promise<void> {
  if (!disponibile()) return
  await (await caches.open(CACHE)).delete(url(fileId, chiave))
}
