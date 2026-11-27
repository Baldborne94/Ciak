import { test, expect, type Page, type Route } from '@playwright/test'
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
  mp4: URL[]
  scansioni: number
  elenchi: number
  fermate: URL[]
  sottotitoli: string[]
  // I sottotitoli dentro il file, fermi finché il test non li lascia arrivare.
  estrazioni: Route[]
  accessi: unknown[]
}

const JACK = '3f2504e04f8911d39a0c0305e82c3301'

async function mockJellyfin(page: Page): Promise<Richieste> {
  const richieste: Richieste = { hls: [], mp4: [], fermate: [], accessi: [], scansioni: 0, elenchi: 0, sottotitoli: [], estrazioni: [] }
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
      // Dentro il file: Jellyfin li estrae leggendolo tutto, e l'inglese
      // arriva solo quando il test lo lascia (un MKV enorme). Le altre
      // lingue non si chiedono.
      { Index: 4, Type: 'Subtitle', Codec: 'subrip', Language: 'eng', IsTextSubtitleStream: true, DisplayTitle: 'English' },
      { Index: 5, Type: 'Subtitle', Codec: 'subrip', Language: 'fre', IsTextSubtitleStream: true, DisplayTitle: 'Français' },
      { Index: 6, Type: 'Subtitle', Codec: 'subrip', Language: 'spa', IsTextSubtitleStream: true, DisplayTitle: 'Español' },
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
    if (p === '/Library/Refresh' && req.method() === 'POST') {
      richieste.scansioni++
      return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*' } })
    }
    if (p === '/ScheduledTasks') {
      // La scansione di una libreria piccola è già finita al primo sguardo.
      return json([{ Key: 'RefreshLibrary', State: 'Idle', LastExecutionResult: { EndTimeUtc: new Date(Date.now() + 1000).toISOString() } }])
    }
    if (p === '/Items') {
      richieste.elenchi++
      return json({
        Items: [
          { Id: FILM, Type: 'Movie', Name: 'Song of the Sea', Path: 'E:\\Ciak\\FILM\\Song of the Sea (2014)\\Song.of.the.Sea.2014.1080p.mp4', DateCreated: '2026-10-01T10:00:00Z' },
          { Id: MKV, Type: 'Movie', Name: 'The Secret of Kells', Path: 'E:\\Ciak\\FILM\\The Secret of Kells (2009)\\The.Secret.of.Kells.2009.mkv', DateCreated: '2026-10-02T10:00:00Z' },
        ],
        TotalRecordCount: 2,
      })
    }
    if (p === `/Users/utente1/Items/${FILM}`) return json({ Id: FILM, MediaSources: [sorgente(FILM, 'mov,mp4,m4a', 'Song.of.the.Sea.2014.1080p.mp4')] })
    if (p === `/Users/utente1/Items/${JACK}`) {
      return json({
        Id: JACK,
        MediaSources: [
          {
            Id: JACK,
            Path: 'E:\\Ciak\\Cartoni\\Samurai Jack\\Season 1\\Samurai.Jack.S01E01.I.The.Beginning.avi',
            Container: 'avi',
            Size: 183500800,
            MediaStreams: [
              { Index: 0, Type: 'Video', Codec: 'mpeg4', BitDepth: 8, BitRate: 878000 },
              { Index: 1, Type: 'Audio', Codec: 'mp3', Language: 'eng' },
            ],
          },
        ],
      })
    }
    if (p === `/Users/utente1/Items/${MKV}`) return json({ Id: MKV, MediaSources: [sorgente(MKV, 'mkv', 'The.Secret.of.Kells.2009.mkv')] })
    const sottotitolo = /\/Subtitles\/(\d+)\/0\/Stream\.vtt$/.exec(p)
    if (sottotitolo) richieste.sottotitoli.push(sottotitolo[1])
    if (sottotitolo && sottotitolo[1] !== '0') return void richieste.estrazioni.push(route)
    if (/\/Subtitles\/0\/0\/Stream\.vtt$/.test(p)) return route.fulfill({ body: VTT, contentType: 'text/vtt', headers: { 'Access-Control-Allow-Origin': '*' } })
    if (p.endsWith('/master.m3u8')) {
      richieste.hls.push(url)
      return route.fulfill({ body: '#EXTM3U\n', contentType: 'application/vnd.apple.mpegurl', headers: { 'Access-Control-Allow-Origin': '*' } })
    }
    if (p === '/Videos/ActiveEncodings') {
      richieste.fermate.push(url)
      return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*' } })
    }
    // La conversione in un MP4 solo, per «Salva in Ciak».
    if (p.endsWith('/stream.mp4')) {
      richieste.mp4.push(url)
      return route.fulfill({ body: Buffer.alloc(4096), contentType: 'video/mp4', headers: { 'Access-Control-Allow-Origin': '*' } })
    }
    // I pezzi del file per l'impronta di OpenSubtitles (64 KB all'inizio e alla fine).
    if (p.endsWith('/stream') && req.headers()['range']) {
      return route.fulfill({ status: 206, body: Buffer.alloc(65536, 7), headers: { 'Access-Control-Allow-Origin': '*', 'Content-Range': 'bytes 0-65535/183500800' } })
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

test('salvato in Ciak, un MKV del server di casa si guarda anche col PC spento', async ({ page }) => {
  await mockSupabase(page)
  const richieste = await mockJellyfin(page)
  await collega(page)
  await page.getByRole('button', { name: /The Secret of Kells \(2009\)/ }).click()

  // Il browser non legge l'MKV: Jellyfin lo manda già convertito in MP4,
  // nella lingua che si sente, coi sottotitoli che conosce.
  await expect(page.getByText(/Jellyfin lo converte in MP4 mentre lo scarica/)).toBeVisible()
  await expect(page.getByText(/Italiano · dalla cartella/)).toBeVisible()
  await page.getByRole('button', { name: /Salva in Ciak/ }).click()
  await expect(page.getByText(/Salvato in Ciak.*col server di casa spento/)).toBeVisible()
  expect(richieste.mp4).toHaveLength(1)
  expect(richieste.mp4[0].pathname).toBe(`/Videos/${MKV}/stream.mp4`)
  expect(richieste.mp4[0].searchParams.get('AudioStreamIndex')).toBe('2')
  // Finito lo scaricamento, la conversione si ferma.
  await expect.poll(() => richieste.fermate.some((u) => u.searchParams.get('playSessionId') === richieste.mp4[0].searchParams.get('PlaySessionId'))).toBe(true)

  // PC spento: il video parte dalla copia, coi suoi sottotitoli, e il server
  // non si chiama nemmeno.
  await page.unroute(`${SERVER}/**`)
  const chiamate: string[] = []
  await page.route(`${SERVER}/**`, (route) => {
    chiamate.push(route.request().url())
    return route.abort('connectionrefused')
  })
  await page.goto(`/streaming/jf-${MKV}`)
  await expect(page.getByText(/Salvato in Ciak/)).toBeVisible()
  await expect(page.locator('video')).toHaveAttribute('src', /^blob:/)
  await expect(page.getByRole('combobox', { name: 'Mostra' }).locator('option')).toHaveText(['Nessun sottotitolo', 'Italiano'])
  await expect(page.getByText(/Il server di casa non risponde/)).toHaveCount(0)
  expect(chiamate.filter((u) => u.includes(MKV))).toEqual([])
})

test('«Aggiorna» fa cercare a Jellyfin i file nuovi, poi rilegge l’elenco', async ({ page }) => {
  // Una serie appena scaricata sul NAS non compariva finché non si apriva
  // Jellyfin per scansionare le librerie a mano.
  await mockSupabase(page)
  const richieste = await mockJellyfin(page)
  await collega(page)
  await expect(page.getByRole('button', { name: /Song of the Sea \(2014\)/ })).toBeVisible()
  // Aprendo la pagina si legge e basta: niente scansione a ogni visita.
  expect(richieste.scansioni).toBe(0)
  const elenchiPrima = richieste.elenchi

  await page.getByRole('button', { name: '🔄 Aggiorna' }).click()
  await expect.poll(() => richieste.scansioni).toBe(1)
  await expect.poll(() => richieste.elenchi).toBeGreaterThan(elenchiPrima)
  await expect(page.getByRole('button', { name: /Song of the Sea \(2014\)/ })).toBeVisible()
})

test('un video del server di casa senza sottotitoli li cerca online, e li tiene in Ciak', async ({ page }) => {
  // Samurai Jack (un AVI senza .srt accanto): Jellyfin non ne conosce, e
  // prima il lettore diceva solo «nessun sottotitolo sul server di casa».
  await mockSupabase(page)
  await mockJellyfin(page)
  const SRT = '1\n00:00:01,000 --> 00:00:04,000\nTanto tempo fa\n'
  const richieste: Record<string, unknown>[] = []
  await page.route('**/api/sottotitoli', (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>
    richieste.push(body)
    if (body.azione === 'cerca') return route.fulfill({ json: { candidati: [{ fileId: 9, lingua: 'it', nome: 'jack.it.srt', download: 1, hash: false }] } })
    return route.fulfill({ json: { testo: SRT, rimasti: 9 } })
  })
  await collega(page)
  await page.goto(`/streaming/jf-${JACK}`)

  await expect(page.getByText(/Italiano · da OpenSubtitles/)).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Mostra' }).locator('option')).toHaveText(['Nessun sottotitolo', 'Italiano'])
  // Cercato per nome della serie, stagione ed episodio, presi dal percorso sul NAS.
  const cerca = richieste.find((r) => r.azione === 'cerca')!
  expect(JSON.stringify(cerca)).toMatch(/Samurai Jack/)
  // E con l'impronta del file, letta dal server a pezzi: trova i sottotitoli
  // sincronizzati proprio su quel file.
  expect(cerca.hash).toMatch(/^[0-9a-f]{16}$/)

  // Trovato una volta, la volta dopo è già in Ciak: non si riscarica (ogni
  // download consuma il tetto giornaliero di OpenSubtitles).
  await page.reload()
  await expect(page.getByText(/Italiano · da OpenSubtitles, salvato in Ciak/)).toBeVisible()
  expect(richieste.filter((r) => r.azione === 'scarica')).toHaveLength(1)
})

test('i sottotitoli del server si chiedono uno per lingua, ognuno si vede appena arriva, e si parte dall’inglese', async ({ page }) => {
  // Interstellar IMAX: una dozzina di tracce dentro l'MKV, ognuna estratta
  // leggendo il file intero. Chiederle tutte e aspettarle insieme teneva il
  // lettore su «Cerco i sottotitoli…» per mezz'ora.
  await mockSupabase(page)
  const richieste = await mockJellyfin(page)
  await collega(page)
  await page.getByRole('button', { name: /The Secret of Kells \(2009\)/ }).click()

  // L'italiano (accanto al file) c'è subito, anche se l'inglese non arriva.
  await expect(page.getByText(/Italiano · dalla cartella/)).toBeVisible()
  const mostra = page.getByRole('combobox', { name: 'Mostra' })
  await expect(mostra.locator('option')).toHaveText(['Nessun sottotitolo', 'Italiano'])
  // Solo italiano e inglese: francese e spagnolo non si fanno estrarre.
  expect([...new Set(richieste.sottotitoli)].sort()).toEqual(['0', '4'])

  // Si guarda con l'inglese: finché non c'è, niente battute in italiano…
  const cc = page.getByRole('button', { name: /^Sottotitoli: / })
  await expect(cc).toHaveText('CC off')
  // …e quando Jellyfin l'ha estratto compare da solo, senza toccare il CC.
  await expect.poll(() => richieste.estrazioni.length).toBeGreaterThan(0)
  for (const r of richieste.estrazioni) {
    await r.fulfill({ body: VTT.replace('C’era una volta', 'Once upon a time'), contentType: 'text/vtt', headers: { 'Access-Control-Allow-Origin': '*' } })
  }
  await expect(mostra.locator('option')).toHaveText(['Nessun sottotitolo', 'Italiano', 'Inglese'])
  await expect(cc).toHaveText('CC EN')
  // L'italiano resta a un tocco.
  await mostra.selectOption({ label: 'Italiano' })
  await expect(cc).toHaveText('CC IT')
})

test('con la rete che non tiene il passo passa da solo alla qualità ridotta, e si torna alla piena', async ({ page }) => {
  // Il tablet lontano dal router: l'episodio diretto si fermava a caricare
  // ogni tanto. Dopo tre attese in poco tempo il lettore chiede a Jellyfin
  // una versione più leggera, e lo dice.
  await mockSupabase(page)
  const richieste = await mockJellyfin(page)
  await collega(page)
  await page.getByRole('button', { name: /Song of the Sea \(2014\)/ }).click()
  const video = page.locator('video')
  await expect(video).toHaveAttribute('src', /stream\?static=true/)

  // Il finto Jellyfin non manda il file: le attese si simulano sul <video>.
  await video.evaluate((v: HTMLVideoElement) => {
    Object.defineProperty(v, 'paused', { configurable: true, get: () => false })
    v.dispatchEvent(new Event('playing'))
    for (let i = 0; i < 3; i++) {
      v.dispatchEvent(new Event('waiting'))
      v.dispatchEvent(new Event('playing'))
    }
  })

  await expect.poll(() => richieste.hls.length).toBeGreaterThan(0)
  const ridotta = richieste.hls[0]
  expect(ridotta.searchParams.get('MaxWidth')).toBe('1280')
  expect(Number(ridotta.searchParams.get('VideoBitrate'))).toBeLessThanOrEqual(3_000_000)
  await expect(page.getByRole('status').filter({ hasText: /qualità ridotta/ })).toBeVisible()

  // A richiesta si torna al file così com'è, e la conversione si ferma.
  await page.getByRole('button', { name: 'Torna alla qualità piena' }).click()
  await expect(video).toHaveAttribute('src', /stream\?static=true/)
  await expect.poll(() => richieste.fermate.length).toBeGreaterThan(0)
  await expect(page.getByRole('status').filter({ hasText: /qualità ridotta/ })).toHaveCount(0)
})
