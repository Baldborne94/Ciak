import { test, expect, type Page } from '@playwright/test'
import { mockTmdb, mockSupabase, signIn } from './support/mocks'

// Il server di casa: Jellyfin sul PC col disco dei film, al posto di (o
// accanto a) Google Drive. Ermetico: il server è finto, risponde come
// Jellyfin 10.10 (le forme vengono da un server vero).

const SERVER = 'https://casa.esempio.ts.net'
const FILM = '06006283103f8493628d6b5b9a95da9d'
const MKV = '27a641bb7cf83b9b409f4d868d9562d8'
const VTT = 'WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nC’era una volta\n'

interface Richieste {
  hls: URL[]
  fermate: URL[]
  accessi: unknown[]
}

async function mockJellyfin(page: Page): Promise<Richieste> {
  const richieste: Richieste = { hls: [], fermate: [], accessi: [] }
  const sorgente = (id: string, contenitore: string, nome: string) => ({
    Id: id,
    Path: `E:\\Ciak\\FILM\\${nome.replace(/\.\w+$/, '')}\\${nome}`,
    Container: contenitore,
    Size: 2147483648,
    MediaStreams: [
      { Index: 0, Type: 'Subtitle', Codec: 'subrip', Language: 'ita', IsExternal: true, IsTextSubtitleStream: true, DisplayTitle: 'Italian' },
      { Index: 1, Type: 'Video', Codec: 'h264', BitDepth: 8 },
      { Index: 2, Type: 'Audio', Codec: 'aac', Language: 'eng', IsDefault: true },
      { Index: 3, Type: 'Audio', Codec: 'ac3', Language: 'ita' },
    ],
  })
  await page.route(`${SERVER}/**`, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const p = url.pathname
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' } })
    const json = (dati: unknown) => route.fulfill({ json: dati, headers: { 'Access-Control-Allow-Origin': '*' } })
    if (p === '/Users/AuthenticateByName') {
      richieste.accessi.push(req.postDataJSON())
      return json({ AccessToken: 'TOKEN-CASA', User: { Id: 'utente1', Name: 'ale' } })
    }
    if (p === '/Library/VirtualFolders') return json([{ Name: 'Film', CollectionType: 'movies', Locations: ['E:\\Ciak\\FILM'] }])
    if (p === '/Items') {
      return json({
        Items: [
          { Id: FILM, Type: 'Movie', Name: 'Song of the Sea', Path: 'E:\\Ciak\\FILM\\Song of the Sea (2014)\\Song.of.the.Sea.2014.1080p.mp4', DateCreated: '2026-10-01T10:00:00Z' },
          { Id: MKV, Type: 'Movie', Name: 'The Secret of Kells', Path: 'E:\\Ciak\\FILM\\The Secret of Kells (2009)\\The.Secret.of.Kells.2009.mkv', DateCreated: '2026-10-02T10:00:00Z' },
        ],
        TotalRecordCount: 2,
      })
    }
    if (p === `/Users/utente1/Items/${FILM}`) return json({ Id: FILM, MediaSources: [sorgente(FILM, 'mov,mp4,m4a', 'Song.of.the.Sea.2014.1080p.mp4')] })
    if (p === `/Users/utente1/Items/${MKV}`) return json({ Id: MKV, MediaSources: [sorgente(MKV, 'mkv', 'The.Secret.of.Kells.2009.mkv')] })
    if (/\/Subtitles\/0\/0\/Stream\.vtt$/.test(p)) return route.fulfill({ body: VTT, contentType: 'text/vtt', headers: { 'Access-Control-Allow-Origin': '*' } })
    if (p.endsWith('/master.m3u8')) {
      richieste.hls.push(url)
      return route.fulfill({ body: '#EXTM3U\n', contentType: 'application/vnd.apple.mpegurl', headers: { 'Access-Control-Allow-Origin': '*' } })
    }
    if (p === '/Videos/ActiveEncodings') {
      richieste.fermate.push(url)
      return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*' } })
    }
    // Il file vero e proprio: resta «in caricamento» per tutto il test.
    if (p.endsWith('/stream')) return
    return route.fulfill({ status: 404, body: '' })
  })
  return richieste
}

async function collega(page: Page) {
  await page.goto('/streaming')
  await page.getByRole('button', { name: '🏠 Collega il server di casa' }).click()
  await page.getByLabel('Indirizzo del server').fill('casa.esempio.ts.net/')
  await page.getByLabel('Utente di Jellyfin').fill('ale')
  await page.getByLabel('Password').fill('segreta')
  await page.getByRole('form', { name: 'Collega il server di casa' }).getByRole('button', { name: /Collega il server di casa/ }).click()
}

test.beforeEach(async ({ page }) => {
  await signIn(page)
  await mockTmdb(page)
})

test('collegato il server di casa, la videoteca mostra i suoi film, MKV compresi', async ({ page }) => {
  await mockSupabase(page)
  const richieste = await mockJellyfin(page)
  await collega(page)

  // Le cartelle del disco fanno da titolo, come quelle di Drive; l'MKV c'è,
  // perché lo converte Jellyfin.
  await expect(page.getByRole('button', { name: /Song of the Sea \(2014\)/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /The Secret of Kells \(2009\)/ })).toBeVisible()
  await expect(page.getByText(/nascost/)).toHaveCount(0)
  expect(richieste.accessi).toEqual([{ Username: 'ale', Pw: 'segreta' }])
  // Resta solo il token, mai la password.
  const salvato = await page.evaluate(() => localStorage.getItem('ciak:jellyfin') ?? '')
  expect(JSON.parse(salvato)).toMatchObject({ url: SERVER, token: 'TOKEN-CASA' })
  expect(salvato).not.toContain('segreta')

  // Ricaricando la pagina il collegamento resta, e si può togliere.
  await page.reload()
  await expect(page.getByRole('button', { name: /Song of the Sea \(2014\)/ })).toBeVisible()
  await page.getByRole('button', { name: 'Scollega il server di casa' }).click()
  await expect(page.getByRole('button', { name: '🏠 Collega il server di casa' })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('ciak:jellyfin'))).toBeNull()
})

test('un MP4 parte diretto dal server, coi sottotitoli; un’altra lingua passa alla conversione', async ({ page }) => {
  const db = await mockSupabase(page)
  const richieste = await mockJellyfin(page)
  await collega(page)
  await page.getByRole('button', { name: /Song of the Sea \(2014\)/ }).click()
  await expect(page).toHaveURL(new RegExp(`/streaming/jf-${FILM}$`))

  // Il file così com'è, col token: niente Drive, niente iframe.
  const video = page.locator('video')
  await expect(video).toHaveAttribute('src', `${SERVER}/Videos/${FILM}/stream?static=true&api_key=TOKEN-CASA`)
  await expect(page.locator('iframe')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Usa il lettore di Drive/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Scarica per l'offline/ })).toHaveCount(0)

  // Il sottotitolo accanto al file, dal server.
  await expect(page.getByText(/Italiano · dalla cartella/)).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Mostra' }).locator('option')).toHaveText(['Nessun sottotitolo', 'Italiano'])

  // Le lingue del file: l'inglese si sente da sé, l'italiano (Dolby) lo
  // converte Jellyfin, ripartendo dallo stesso punto.
  await page.getByRole('button', { name: 'Audio: Inglese. Cambia lingua' }).click()
  await page.getByRole('group', { name: "Lingua dell'audio" }).getByRole('button', { name: 'Italiano' }).click()
  await expect.poll(() => richieste.hls.length).toBeGreaterThan(0)
  const hls = richieste.hls[0]
  expect(hls.pathname).toBe(`/Videos/${FILM}/master.m3u8`)
  expect(hls.searchParams.get('AudioStreamIndex')).toBe('3')
  expect(hls.searchParams.get('api_key')).toBe('TOKEN-CASA')
  await expect(video).toHaveAttribute('src', /^blob:/)
  await expect(page.getByRole('button', { name: 'Audio: Italiano. Cambia lingua' })).toBeVisible()

  // Tornando all'inglese la conversione si ferma: il PC non lavora per niente.
  await page.getByRole('button', { name: 'Audio: Italiano. Cambia lingua' }).click()
  await page.getByRole('group', { name: "Lingua dell'audio" }).getByRole('button', { name: 'Inglese' }).click()
  await expect(video).toHaveAttribute('src', /stream\?static=true/)
  await expect.poll(() => richieste.fermate.length).toBeGreaterThan(0)
  expect(richieste.fermate[0].searchParams.get('playSessionId')).toBe(hls.searchParams.get('PlaySessionId'))

  // L'archivio funziona come con Drive: il file si lega al suo id «jf-».
  await expect.poll(() => db.writes.some((w) => w.table === 'user_streaming' && JSON.stringify(w.body).includes(`jf-${FILM}`))).toBe(true)
})

test('un MKV si apre già convertito dal server', async ({ page }) => {
  await mockSupabase(page)
  const richieste = await mockJellyfin(page)
  await collega(page)
  await page.getByRole('button', { name: /The Secret of Kells \(2009\)/ }).click()
  await expect.poll(() => richieste.hls.length).toBeGreaterThan(0)
  // La prima lingua del file, chiesta per nome: è quella che si sentirebbe.
  expect(richieste.hls[0].searchParams.get('AudioStreamIndex')).toBe('2')
  // hls.js riempie il <video> da sé (un indirizzo blob:), non col file.
  await expect(page.locator('video')).toHaveAttribute('src', /^blob:/)
  await expect(page.getByText(/Jellyfin converte il video al volo/)).toBeVisible()
})

test('col PC spento lo si dice, invece di una pagina vuota', async ({ page }) => {
  await mockSupabase(page)
  await mockJellyfin(page)
  await collega(page)
  await expect(page.getByRole('button', { name: /Song of the Sea \(2014\)/ })).toBeVisible()
  await page.unroute(`${SERVER}/**`)
  await page.route(`${SERVER}/**`, (route) => route.abort('connectionrefused'))
  await page.getByRole('button', { name: '🔄 Aggiorna' }).click()
  await expect(page.getByText(/il PC è acceso, con Jellyfin aperto/)).toBeVisible()
})
