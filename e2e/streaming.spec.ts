import { test, expect, type Page } from '@playwright/test'
import { mockTmdb, mockSupabase, signIn } from './support/mocks'
import { movieDetail } from './support/fixtures'

// «Streaming»: i film nella cartella «Ciak» di Google Drive, riprodotti col
// lettore di Drive. Ermetico — Google Identity Services, l'API Drive e il
// lettore sono tutti mockati: niente rete, niente vero login Google.

const CARTELLA = 'application/vnd.google-apps.folder'

const SRT = '1\n00:00:01,000 --> 00:00:03,000\nC\'era una volta\n'

// I singoli file, come li restituisce files.get.
const FILE: Record<string, unknown> = {
  'video-song-0001': {
    id: 'video-song-0001',
    name: 'Song.of.the.Sea.2014.1080p.mp4',
    size: '2147483648',
    mimeType: 'video/mp4',
    parents: ['cartella-song'],
  },
  'cartella-song': {
    id: 'cartella-song',
    name: 'Song of the Sea (2014) [1080p]',
    mimeType: CARTELLA,
    parents: ['cartella-film'],
  },
}

// Risponde alle richieste a Drive come farebbe un Drive con:
//   Ciak/SERIE TV/B99 S7E2.mp4
//   Ciak/FILM/Song of the Sea (2014) [1080p]/Song.of.the.Sea.2014.1080p.mp4
//   Ciak/FILM/The.Secret.of.Kells.2009.mkv (nascosto: Ciak riproduce gli MP4)
//   (e, se richiesto, …/Song.of.the.Sea.it.srt)
// Le scritture (salvataggio e cestino dei sottotitoli) finiscono in `scritture`.
async function mockDrive(page: Page, { conCartellaCiak = true, sottotitoliNellaCartella = false } = {}) {
  const scritture: { metodo: string; url: string; corpo: string }[] = []
  await page.route(/^https:\/\/www\.googleapis\.com\/(upload\/)?drive\/v3\/files/, (route) => {
    const req = route.request()
    const url = new URL(req.url())
    if (req.method() !== 'GET') {
      scritture.push({ metodo: req.method(), url: req.url(), corpo: req.postData() ?? '' })
      return route.fulfill({ json: { id: 'sottotitolo-salvato-01' } })
    }

    const id = url.pathname.split('/files/')[1]
    if (id) {
      if (url.searchParams.get('alt') === 'media') {
        if (id === 'sub-song-it-0001') return route.fulfill({ contentType: 'application/x-subrip', body: SRT })
        // I due pezzi da 64 KB per l'hash di OpenSubtitles: zeri.
        return route.fulfill({ status: 206, body: Buffer.alloc(65536) })
      }
      return route.fulfill({ json: FILE[id] ?? {} })
    }

    const q = url.searchParams.get('q') ?? ''
    let files: unknown[] = []
    if (q.includes('mimeType != ')) {
      // I file accanto al film.
      files = [
        FILE['video-song-0001'],
        ...(sottotitoliNellaCartella
          ? [{ id: 'sub-song-it-0001', name: 'Song.of.the.Sea.it.srt', mimeType: 'application/x-subrip' }]
          : []),
      ]
    } else if (q.includes("name = 'Ciak'")) {
      files = conCartellaCiak ? [{ id: 'cartella-ciak', name: 'Ciak' }] : []
    } else if (q.includes(CARTELLA)) {
      // Ciak/FILM e Ciak/SERIE TV, le categorie; in FILM la cartella del film.
      files = q.includes("'cartella-ciak' in parents")
        ? [
            { id: 'cartella-film', name: 'FILM', parents: ['cartella-ciak'] },
            { id: 'cartella-serie', name: 'SERIE TV', parents: ['cartella-ciak'] },
          ]
        : q.includes("'cartella-film' in parents")
          ? [{ id: 'cartella-song', name: 'Song of the Sea (2014) [1080p]', parents: ['cartella-film'] }]
          : []
    } else if (q.includes("mimeType contains 'video/'")) {
      files = [
        FILE['video-song-0001'],
        {
          id: 'video-b99-00001',
          name: 'B99 S7E2.mp4',
          size: '325058560',
          mimeType: 'video/mp4',
          parents: ['cartella-serie'],
        },
        {
          id: 'video-kells-0001',
          name: 'The.Secret.of.Kells.2009.mkv',
          size: '2901526000',
          mimeType: 'video/x-matroska',
          parents: ['cartella-film'],
        },
      ]
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ files }) })
  })
  return { scritture }
}

// Il lettore di Ciak passa dal service worker, che nel dev server dei test non
// c'è: si finge che controlli la pagina e si risponde noi a /drive-video/.
// `video: 'fermo'` lascia la richiesta in sospeso (il film «sta caricando»),
// `'illeggibile'` risponde con un errore, come un formato che il browser non legge.
async function conLettoreCiak(page: Page, video: 'fermo' | 'illeggibile' = 'fermo') {
  await page.addInitScript(() => {
    // Il finto worker sa dire la sua versione, come quello vero.
    const controller = {
      postMessage: (m: { tipo?: string }, transfer?: MessagePort[]) => {
        if (m?.tipo === 'ciak:versione' && transfer?.[0]) transfer[0].postMessage({ versione: 'e2e-test' })
      },
    }
    Object.defineProperty(ServiceWorkerContainer.prototype, 'controller', {
      get: () => controller,
      configurable: true,
    })
  })
  await page.route('**/drive-video/**', (route) => {
    if (video === 'illeggibile') return route.fulfill({ status: 415, body: '' })
    // In sospeso: il film resta «in caricamento» per tutto il test.
  })
}

async function apriSongOfTheSea(page: Page) {
  await page.goto('/streaming')
  await page.getByRole('button', { name: /Collega Google Drive/ }).click()
  // Per nome del file: il titolo mostrato cambia quando Ciak lo riconosce.
  await page.getByRole('button', { name: /Song\.of\.the\.Sea\.2014/ }).click()
  await expect(page).toHaveURL(/\/streaming\/video-song-0001$/)
}

test.beforeEach(async ({ page }) => {
  await signIn(page)
  await mockSupabase(page)
  await mockTmdb(page)
  // Le schede dei titoli di prova, col loro titolo originale.
  await page.route('**/api/tmdb*', (route) => {
    const path = new URL(route.request().url()).searchParams.get('path') ?? ''
    if (path === '/movie/110416') {
      return route.fulfill({ json: movieDetail(110416, 'La canzone del mare', { original_title: 'Song of the Sea' }) })
    }
    return route.fallback()
  })

  // Stub di Google Identity Services: niente popup, token finto immediato.
  await page.addInitScript(() => {
    const w = window as unknown as {
      google?: {
        accounts?: {
          oauth2?: {
            initTokenClient: (c: {
              callback: (r: { access_token: string; expires_in: number }) => void
            }) => { requestAccessToken: () => void }
          }
        }
      }
    }
    w.google = {
      accounts: {
        oauth2: {
          initTokenClient: (config) => ({
            requestAccessToken: () =>
              config.callback({ access_token: 'fake-token', expires_in: 3600 }),
          }),
        },
      },
    }
  })

  // Il lettore di Drive: stub, così l'iframe non fa una richiesta vera.
  await page.route('https://drive.google.com/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<html><body>lettore</body></html>' }),
  )
})

test('«Streaming» elenca i film della cartella Ciak e li apre nel player', async ({ page }) => {
  await mockDrive(page)
  await page.goto('/streaming')

  await expect(page.getByRole('heading', { name: 'La mia videoteca' })).toBeVisible()
  await page.getByRole('button', { name: /Collega Google Drive/ }).click()

  // Il film in una sottocartella prende il nome della cartella; l'altro quello
  // del file senza estensione.
  await expect(page.getByText('Song of the Sea (2014) [1080p]')).toBeVisible()
  await expect(page.getByText('B99 S7E2', { exact: true })).toBeVisible()
  await expect(page.getByText(/MP4 · 2,0 GB · Song\.of\.the\.Sea/)).toBeVisible()
  // L'MKV non compare, ma la pagina dice che c'è e come renderlo visibile.
  await expect(page.getByText('The.Secret.of.Kells.2009', { exact: false })).toHaveCount(0)
  await expect(page.getByText(/1 video in un altro formato \(MKV, AVI…\) è nascosto/)).toBeVisible()

  // Aprendo il film si va alla pagina del player, grande. Senza service worker
  // (qui non c'è) il lettore di Ciak non può partire: si usa quello di Drive.
  await page.getByRole('button', { name: /Song of the Sea/ }).click()
  await expect(page).toHaveURL(/\/streaming\/video-song-0001$/)
  await expect(page.getByRole('heading', { name: 'Song of the Sea (2014) [1080p]' })).toBeVisible()
  await expect(page.locator('iframe')).toHaveAttribute(
    'src',
    'https://drive.google.com/file/d/video-song-0001/preview',
  )
  // E lo dice, invece di lasciare il lettore di Drive senza un perché.
  await expect(page.getByText('Il lettore di Ciak, quello con i sottotitoli, non è ancora attivo')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ricarica la pagina' })).toBeVisible()
  // Le istruzioni per i sottotitoli portano al file su Drive.
  await expect(page.getByRole('link', { name: /Apri su Drive/ })).toHaveAttribute(
    'href',
    'https://drive.google.com/file/d/video-song-0001/view',
  )

  // Tornando indietro l'elenco si ricarica da solo, senza ricollegarsi.
  await page.getByRole('link', { name: /Torna ai film/ }).click()
  await expect(page.getByText('B99 S7E2', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /Collega Google Drive/ })).toHaveCount(0)
})

test('ricaricando la pagina il collegamento a Drive resta', async ({ page }) => {
  await mockDrive(page)
  await page.goto('/streaming')
  await page.getByRole('button', { name: /Collega Google Drive/ }).click()
  await expect(page.getByText('B99 S7E2', { exact: true })).toBeVisible()

  await page.reload()

  await expect(page.getByText('B99 S7E2', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /Collega Google Drive/ })).toHaveCount(0)
})

test('senza la cartella «Ciak» spiega come crearla', async ({ page }) => {
  await mockDrive(page, { conCartellaCiak: false })
  await page.goto('/streaming')
  await page.getByRole('button', { name: /Collega Google Drive/ }).click()

  await expect(page.getByText('Nessuna cartella «Ciak» su Drive')).toBeVisible()
})

test('lo streaming ha una voce sua nel menu', async ({ page }) => {
  await mockDrive(page)
  await page.goto('/')

  await page.getByRole('link', { name: '🎬 Streaming' }).first().click()
  await expect(page).toHaveURL(/\/streaming$/)
})

test('il vecchio indirizzo /drive porta alla sezione Streaming', async ({ page }) => {
  await page.goto('/drive')
  await expect(page).toHaveURL(/\/streaming$/)
})

test('un indirizzo di film non valido non finisce nel lettore', async ({ page }) => {
  await page.goto('/streaming/bad')
  await expect(page.getByText('Film non trovato')).toBeVisible()
  await expect(page.locator('iframe')).toHaveCount(0)
})

test('il lettore di Ciak usa il sottotitolo che sta nella cartella del film', async ({ page }) => {
  await conLettoreCiak(page)
  await mockDrive(page, { sottotitoliNellaCartella: true })
  let ricercheOnline = 0
  await page.route('**/api/sottotitoli', (route) => {
    ricercheOnline++
    return route.fulfill({ json: { candidati: [] } })
  })

  await apriSongOfTheSea(page)

  // Il video arriva dal service worker, non dall'iframe di Drive.
  await expect(page.locator('video')).toHaveAttribute('src', '/drive-video/video-song-0001')
  await expect(page.locator('iframe')).toHaveCount(0)
  await expect(page.getByText(/Italiano · dalla cartella su Drive/)).toBeVisible()
  await expect(page.locator('video track[kind="subtitles"]').first()).toHaveAttribute('label', 'Italiano')
  // L'italiano c'era già; per l'inglese, che manca, si è cercato online (senza esito).
  await expect.poll(() => ricercheOnline).toBe(1)
  await expect(page.getByText(/Nessun sottotitolo in inglese/)).toBeVisible()

  // Il service worker racconta cosa risponde Drive: la pagina lo mostra nei
  // dettagli tecnici, così un salto che non funziona si spiega da uno screenshot.
  await page.evaluate(() => {
    navigator.serviceWorker.dispatchEvent(
      new MessageEvent('message', {
        data: {
          tipo: 'ciak:diagnostica',
          quando: Date.now(),
          ms: 380,
          range: 'bytes=1048576-',
          status: 200,
          redirect: null,
          contentLength: '2147483648',
          totale: 2147483648,
          esito: 'range-ignorato',
        },
      }),
    )
  })
  await page.getByText('Dettagli tecnici (cosa risponde Drive)').click()
  // La versione del worker dice se il browser ha preso davvero l'ultimo.
  await expect(page.getByText('Service worker: e2e-test')).toBeVisible()
  await expect(page.getByText(/chiesto bytes=1048576- → Drive ha ignorato il Range/)).toBeVisible()
})

test('senza sottotitoli nella cartella li cerca online, in italiano e in inglese, e li salva accanto al film', async ({ page }) => {
  await conLettoreCiak(page)
  const { scritture } = await mockDrive(page)
  const richieste: Record<string, unknown>[] = []
  await page.route('**/api/sottotitoli', (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>
    richieste.push(body)
    if (body.azione === 'cerca') {
      return route.fulfill({
        json: {
          candidati: [
            { fileId: 111, lingua: 'it', nome: 'song.it.srt', download: 50, hash: true },
            { fileId: 222, lingua: 'en', nome: 'song.en.srt', download: 900, hash: false },
            { fileId: 333, lingua: 'it', nome: 'song2.it.srt', download: 10, hash: false },
          ],
        },
      })
    }
    return route.fulfill({ json: { testo: SRT, rimasti: 9 } })
  })

  await apriSongOfTheSea(page)

  // Due tracce, italiano e inglese, da una ricerca sola.
  await expect(page.getByText(/Italiano · da OpenSubtitles, salvato nella cartella/)).toBeVisible()
  await expect(page.getByText(/Inglese · da OpenSubtitles, salvato nella cartella/)).toBeVisible()
  await expect(page.locator('video track[kind="subtitles"]')).toHaveCount(2)
  // Il film si cerca per titolo e anno, e con l'hash del file per trovare
  // sottotitoli già sincronizzati (qui i pezzi sono zeri: resta la dimensione).
  expect(richieste.filter((r) => r.azione === 'cerca')).toHaveLength(1)
  expect(richieste[0]).toMatchObject({
    azione: 'cerca',
    query: 'Song of the Sea',
    anno: 2014,
    hash: '0000000080000000',
  })
  expect(richieste.filter((r) => r.azione === 'scarica').map((r) => r.fileId)).toEqual([111, 222])
  // Salvati nella cartella del film, col nome del video e la lingua: la volta dopo ci sono già.
  expect(scritture.filter((s) => s.metodo === 'POST').map((s) => /"name":"([^"]+)"/.exec(s.corpo)?.[1])).toEqual([
    'Song.of.the.Sea.2014.1080p.it.srt',
    'Song.of.the.Sea.2014.1080p.en.srt',
  ])
  expect(scritture[0].corpo).toContain('"parents":["cartella-song"]')

  // L'italiano fuori sincrono: si passa al candidato dopo della stessa lingua e
  // quello scartato va nel cestino. L'inglese non ha alternative: nessun pulsante.
  await page.getByRole('button', { name: 'Italiano fuori sincrono? Prova un altro' }).click()
  await expect(page.getByRole('button', { name: /Inglese fuori sincrono/ })).toHaveCount(0)
  await expect.poll(() => richieste.filter((r) => r.azione === 'scarica').map((r) => r.fileId)).toEqual([111, 222, 333])
  const cestino = scritture.find((s) => s.metodo === 'PATCH')
  expect(cestino?.url).toContain('/files/sottotitolo-salvato-01')
  expect(JSON.parse(cestino?.corpo ?? '{}')).toEqual({ trashed: true })
})

test('se il browser non legge il file propone il lettore di Drive', async ({ page }) => {
  await conLettoreCiak(page, 'illeggibile')
  await mockDrive(page, { sottotitoliNellaCartella: true })

  await apriSongOfTheSea(page)

  const avviso = page.getByRole('alert')
  await expect(avviso).toContainText('Il browser non riesce a leggere questo file')
  await avviso.getByRole('button', { name: 'Usa il lettore di Drive' }).click()
  await expect(page.locator('iframe')).toHaveAttribute(
    'src',
    'https://drive.google.com/file/d/video-song-0001/preview',
  )
  await expect(page.locator('video')).toHaveCount(0)
})

test('quando il service worker prende la scheda passa da solo al lettore di Ciak', async ({ page }) => {
  // La scheda parte senza worker (come dopo un Ctrl+F5); poi il worker la prende.
  await page.addInitScript(() => {
    const w = window as unknown as { __controller: unknown }
    w.__controller = null
    Object.defineProperty(ServiceWorkerContainer.prototype, 'controller', {
      get: () => w.__controller,
      configurable: true,
    })
  })
  await page.route('**/drive-video/**', () => {
    // In sospeso: il film «sta caricando».
  })
  await mockDrive(page, { sottotitoliNellaCartella: true })

  await apriSongOfTheSea(page)
  await expect(page.locator('iframe')).toBeVisible()

  await page.evaluate(() => {
    ;(window as unknown as { __controller: unknown }).__controller = {}
    navigator.serviceWorker.dispatchEvent(new Event('controllerchange'))
  })

  await expect(page.locator('video')).toHaveAttribute('src', '/drive-video/video-song-0001')
  await expect(page.getByText('Italiano · dalla cartella su Drive')).toBeVisible()
})

test('mentre il film va, il lettore tiene sveglio il service worker', async ({ page }) => {
  // Chrome ferma un worker fermo da 30 secondi, e con lui la richiesta del
  // film: era l'«errore di rete» a metà film. Si accelera l'orologio.
  await page.clock.install()
  await page.addInitScript(() => {
    const w = window as unknown as { __messaggi: unknown[] }
    w.__messaggi = []
    Object.defineProperty(ServiceWorkerContainer.prototype, 'controller', {
      get: () => ({ postMessage: (m: unknown) => w.__messaggi.push(m) }),
      configurable: true,
    })
  })
  await page.route('**/drive-video/**', () => {
    // In sospeso: il film «sta caricando».
  })
  await mockDrive(page, { sottotitoliNellaCartella: true })

  await apriSongOfTheSea(page)
  await expect(page.locator('video')).toBeVisible()
  await page.clock.runFor(61_000)

  const messaggi = await page.evaluate(() => (window as unknown as { __messaggi: unknown[] }).__messaggi)
  expect(messaggi.filter((m) => (m as { tipo?: string }).tipo === 'ciak:tieni-vivo').length).toBeGreaterThanOrEqual(3)
})

test('un film si scarica sul dispositivo e da lì si guarda anche senza rete', async ({ page }) => {
  await conLettoreCiak(page)
  await mockDrive(page, { sottotitoliNellaCartella: true })
  await page.route('**/api/sottotitoli', (route) => route.fulfill({ json: { candidati: [] } }))
  // Il «film»: pochi byte, serviti come farebbe il service worker.
  await page.unroute('**/drive-video/**')
  await page.route('**/drive-video/**', (route) =>
    route.fulfill({ status: 200, contentType: 'video/mp4', body: Buffer.alloc(64, 1) }),
  )

  await apriSongOfTheSea(page)
  await expect(page.getByText(/Italiano · dalla cartella su Drive/)).toBeVisible()
  await page.getByRole('button', { name: "Scarica per l'offline" }).click()
  await expect(page.getByText(/Scaricato sul dispositivo/)).toBeVisible()

  // In cache: il film, e la sua scheda coi sottotitoli trovati.
  const scheda = await page.evaluate(async () => {
    const cache = await caches.open('ciak-film-v1')
    const info = await (await cache.match('/film-offline/video-song-0001/info.json'))?.json()
    const film = await cache.match('/film-offline/video-song-0001')
    return { info, byte: (await film?.arrayBuffer())?.byteLength }
  })
  expect(scheda.byte).toBe(64)
  expect(scheda.info).toMatchObject({
    id: 'video-song-0001',
    titolo: 'Song of the Sea (2014) [1080p]',
    stato: 'completo',
    sottotitoli: [expect.objectContaining({ chiave: 'it', vtt: expect.stringContaining('WEBVTT') })],
  })

  // Nell'elenco il film è segnato come disponibile offline.
  await page.getByRole('link', { name: /Torna ai film/ }).click()
  await expect(page.getByRole('heading', { name: /Sul dispositivo/ })).toBeVisible()
  await expect(page.getByText('Disponibile offline', { exact: false })).toBeVisible()

  // Senza rete: niente Drive, ma il film scaricato si apre col lettore di Ciak
  // e i sottotitoli salvati, anche senza il collegamento a Google.
  await page.evaluate(() => sessionStorage.removeItem('ciak:drive-token'))
  await page.addInitScript(() => Object.defineProperty(navigator, 'onLine', { get: () => false }))
  await page.route('https://www.googleapis.com/**', (route) => route.abort())
  await page.goto('/streaming')
  await expect(page.getByText('Sei offline')).toBeVisible()
  await page.getByRole('button', { name: /Song of the Sea/ }).click()
  await expect(page.locator('video')).toHaveAttribute('src', '/drive-video/video-song-0001')
  await expect(page.locator('video track[kind="subtitles"]')).toHaveAttribute('label', 'Italiano')
  await expect(page.getByText(/Italiano · dalla cartella su Drive/)).toBeVisible()

  await page.getByRole('button', { name: 'Elimina dal dispositivo' }).click()
  await expect(page.getByText(/Scaricalo sul dispositivo/)).toBeVisible()
})

// ── Il lettore collegato all'archivio ─────────────────────────────────────────

const SONG = {
  id: 110416,
  media_type: 'movie',
  title: 'La canzone del mare',
  original_title: 'Song of the Sea',
  release_date: '2014-09-06',
  poster_path: '/song.jpg',
  genre_ids: [16],
}

// Il catalogo risponde alla ricerca con i risultati dati; tutto il resto al
// mock generale.
async function cercaTmdb(page: Page, risultati: unknown[], dettaglioTv?: Record<string, unknown>) {
  await page.route('**/api/tmdb*', (route) => {
    const path = new URL(route.request().url()).searchParams.get('path') ?? ''
    if (path === '/search/multi') return route.fulfill({ json: { results: risultati } })
    if (dettaglioTv && /^\/tv\/\d+$/.test(path)) return route.fulfill({ json: dettaglioTv })
    // La scheda di un film: il titolo italiano è quello dei risultati di ricerca.
    const film = /^\/movie\/(\d+)$/.exec(path)
    if (film) {
      const r = risultati.find((x) => (x as { id: number }).id === Number(film[1])) as
        | { title: string; original_title?: string }
        | undefined
      if (r) return route.fulfill({ json: movieDetail(Number(film[1]), r.title, { original_title: r.original_title ?? r.title }) })
    }
    return route.fallback()
  })
}

// Finge che il video sia a un certo punto e scorra: il lettore vero, nel dev
// server senza film, non si muove da solo.
async function portaIlVideoA(page: Page, secondi: number, durata: number) {
  await page.evaluate(
    ([t, d]) => {
      const v = document.querySelector('video') as HTMLVideoElement
      Object.defineProperty(v, 'duration', { configurable: true, get: () => d })
      Object.defineProperty(v, 'paused', { configurable: true, get: () => false })
      Object.defineProperty(v, 'currentTime', { configurable: true, get: () => t, set: () => {} })
      v.dispatchEvent(new Event('timeupdate'))
    },
    [secondi, durata],
  )
}

test('la lista riconosce i film di Drive e li mostra col titolo e la locandina', async ({ page }) => {
  const db = await mockSupabase(page)
  await mockDrive(page)
  await cercaTmdb(page, [SONG])

  await page.goto('/streaming')
  await page.getByRole('button', { name: /Collega Google Drive/ }).click()

  // Il file «Song.of.the.Sea.2014.1080p.mp4» è diventato il film di TMDB.
  await expect(page.getByText('Song of the Sea', { exact: true })).toBeVisible()
  await expect.poll(() => db.tables.user_streaming?.find((r) => r.drive_file_id === 'video-song-0001')).toMatchObject({
    tmdb_id: 110416,
    media_type: 'movie',
    titolo: 'Song of the Sea',
    nome_file: 'Song.of.the.Sea.2014.1080p.mp4',
  })
  // «B99» non somiglia abbastanza a niente: resta il nome del file, e la riga
  // senza titolo evita di ricercarlo a ogni apertura.
  await expect(page.getByText('B99 S7E2', { exact: true })).toBeVisible()
  await expect
    .poll(() => db.tables.user_streaming?.find((r) => r.drive_file_id === 'video-b99-00001'))
    .toMatchObject({ nome_file: 'B99 S7E2.mp4' })
  expect(db.tables.user_streaming?.find((r) => r.drive_file_id === 'video-b99-00001')?.tmdb_id).toBeUndefined()
})

test('a fine film lo segna visto nel diario, lo toglie da «Da vedere» e chiede il voto', async ({ page }) => {
  await conLettoreCiak(page)
  await mockDrive(page, { sottotitoliNellaCartella: true })
  const db = await mockSupabase(page, {
    user_titles: [
      { id: 't1', user_id: 'e2e-user-0000-0000-000000000000', tmdb_id: 110416, media_type: 'movie', title: 'La canzone del mare', status: 'to_watch', genre_ids: [] },
    ],
    user_streaming: [
      {
        id: 's1',
        user_id: 'e2e-user-0000-0000-000000000000',
        drive_file_id: 'video-song-0001',
        tmdb_id: 110416,
        media_type: 'movie',
        titolo: 'La canzone del mare',
        poster_path: '/song.jpg',
        posizione: 0,
        durata: 5640,
        // Quasi tutto già guardato in una sera precedente.
        secondi_visti: 5000,
        visto_il: null,
        abbinato_a_mano: false,
      },
    ],
  })

  await apriSongOfTheSea(page)
  await expect(page.getByRole('link', { name: 'Song of the Sea' })).toHaveAttribute('href', '/title/movie/110416')

  await portaIlVideoA(page, 5400, 5640)

  await expect(page.getByText('Segnato come visto nel diario, oggi')).toBeVisible()
  await expect.poll(() => db.tables.user_diary?.[0]).toMatchObject({ tmdb_id: 110416, media_type: 'movie', rating: null })
  await expect.poll(() => db.tables.user_titles.find((r) => r.tmdb_id === 110416)?.status).toBe('watched')
  await expect.poll(() => db.tables.user_streaming.find((r) => r.drive_file_id === 'video-song-0001')?.visto_il).toBeTruthy()

  await page.getByRole('button', { name: '4 stelle', exact: true }).click()
  await expect(page.getByText('Voto salvato.')).toBeVisible()
  await expect.poll(() => db.tables.user_diary?.[0]?.rating).toBe(4)
})

test('saltare alla fine senza averlo guardato non lo segna come visto', async ({ page }) => {
  await conLettoreCiak(page)
  await mockDrive(page, { sottotitoliNellaCartella: true })
  const db = await mockSupabase(page, {
    user_streaming: [
      { id: 's1', user_id: 'e2e-user-0000-0000-000000000000', drive_file_id: 'video-song-0001', tmdb_id: 110416, media_type: 'movie', titolo: 'La canzone del mare', posizione: 0, durata: 5640, secondi_visti: 0, visto_il: null, abbinato_a_mano: false },
    ],
  })

  await apriSongOfTheSea(page)
  await expect(page.getByRole('link', { name: 'Song of the Sea' })).toBeVisible()
  await portaIlVideoA(page, 5500, 5640)
  await page.waitForTimeout(500)

  await expect(page.getByText('Segnato come visto nel diario')).toHaveCount(0)
  expect(db.tables.user_diary ?? []).toHaveLength(0)
})

test('riapre il film dal punto in cui ci si era fermati', async ({ page }) => {
  await conLettoreCiak(page)
  await mockDrive(page, { sottotitoliNellaCartella: true })
  await mockSupabase(page, {
    user_streaming: [
      { id: 's1', user_id: 'e2e-user-0000-0000-000000000000', drive_file_id: 'video-song-0001', tmdb_id: 110416, media_type: 'movie', titolo: 'La canzone del mare', posizione: 1345, durata: 5640, secondi_visti: 1300, visto_il: null, abbinato_a_mano: false, updated_at: new Date().toISOString() },
    ],
  })

  await apriSongOfTheSea(page)
  await expect(page.getByRole('link', { name: 'Song of the Sea' })).toBeVisible()
  // I metadati del video arrivano: si riparte qualche secondo prima.
  await page.evaluate(() => document.querySelector('video')?.dispatchEvent(new Event('loadedmetadata')))

  await expect(page.getByText(/Ripreso da 22:20/)).toBeVisible()
  await expect(page.getByRole('button', { name: "Ricomincia dall'inizio" })).toBeVisible()
})

test('«Non è questo?» fa scegliere il titolo a mano, e resta scelto', async ({ page }) => {
  await conLettoreCiak(page)
  await mockDrive(page, { sottotitoliNellaCartella: true })
  const db = await mockSupabase(page)
  await cercaTmdb(page, [SONG, { ...SONG, id: 42, title: 'Song of the Sea (corto)', original_title: 'Song of the Sea (corto)', release_date: '2012-01-01' }])

  await apriSongOfTheSea(page)
  // La lista l'ha già riconosciuto come «Song of the Sea»: lo si corregge.
  await expect(page.getByRole('link', { name: 'Song of the Sea' })).toBeVisible()
  await page.getByRole('button', { name: 'Non è questo?' }).click()
  await page.getByRole('button', { name: 'Cerca', exact: true }).click()
  await page.getByRole('button', { name: /Song of the Sea \(corto\)/ }).click()

  await expect(page.getByRole('link', { name: 'Song of the Sea (corto)' })).toHaveAttribute('href', '/title/movie/42')
  await expect
    .poll(() => db.tables.user_streaming?.find((r) => r.drive_file_id === 'video-song-0001'))
    .toMatchObject({ tmdb_id: 42, abbinato_a_mano: true })
})

test('a fine episodio lo spunta, mette la serie in corso e propone il prossimo', async ({ page }) => {
  await conLettoreCiak(page)
  await mockDrive(page, { sottotitoliNellaCartella: true })
  const riga = (id: string, episodio: number, extra: Record<string, unknown> = {}) => ({
    id,
    user_id: 'e2e-user-0000-0000-000000000000',
    drive_file_id: id,
    nome_file: `Shogun.S01E0${episodio}.mkv`,
    tmdb_id: 126308,
    media_type: 'tv',
    titolo: 'Shōgun',
    stagione: 1,
    episodio,
    posizione: 0,
    durata: 3600,
    secondi_visti: 0,
    visto_il: null,
    abbinato_a_mano: false,
    ...extra,
  })
  const db = await mockSupabase(page, {
    // Il file aperto è l'episodio 1 (l'id del film di prova), il 2 è un altro file.
    user_streaming: [riga('video-song-0001', 1, { secondi_visti: 3400 }), riga('video-shogun-02', 2)],
  })
  await cercaTmdb(page, [], movieDetail(126308, 'Shōgun', {
    name: 'Shōgun',
    seasons: [{ id: 1, season_number: 1, episode_count: 10, name: 'Stagione 1', poster_path: null, air_date: '2024-02-27' }],
  }))

  await apriSongOfTheSea(page)
  await expect(page.getByRole('link', { name: 'Shōgun · S1E1' })).toHaveAttribute('href', '/title/tv/126308?season=1&episode=1')
  await portaIlVideoA(page, 3500, 3600)

  await expect(page.getByText('Episodio S1E1 spuntato: Shōgun è in corso.')).toBeVisible()
  await expect.poll(() => db.tables.user_episodes?.[0]).toMatchObject({ tv_id: 126308, season_number: 1, episode_number: 1 })
  await expect.poll(() => db.tables.user_titles?.find((r) => r.tmdb_id === 126308)?.status).toBe('in_progress')

  await page.getByRole('button', { name: /Prossimo episodio: S1E2/ }).first().click()
  await expect(page).toHaveURL(/\/streaming\/video-shogun-02$/)
})

test('i titoli restano quelli originali del film, tradotti solo se illeggibili', async ({ page }) => {
  const db = await mockSupabase(page, {
    // Riconosciuto prima della correzione: col titolo tradotto.
    user_streaming: [
      { id: 's0', user_id: 'e2e-user-0000-0000-000000000000', drive_file_id: 'video-b99-00001', nome_file: 'B99 S7E2.mp4', tmdb_id: 48891, media_type: 'tv', titolo: 'Brooklyn 99 - Nove-Nove', stagione: 7, episodio: 2, posizione: 0, secondi_visti: 0, abbinato_a_mano: true },
    ],
  })
  await mockDrive(page)
  await page.route('**/api/tmdb*', (route) => {
    const path = new URL(route.request().url()).searchParams.get('path') ?? ''
    // La ricerca in italiano restituisce il titolo tradotto…
    if (path === '/search/multi') return route.fulfill({ json: { results: [SONG] } })
    // …ma il film è «Song of the Sea», ed è quello che si guarda.
    if (path === '/tv/48891') return route.fulfill({ json: movieDetail(48891, 'Brooklyn 99 - Nove-Nove', { original_title: 'Brooklyn Nine-Nine' }) })
    return route.fallback()
  })

  await page.goto('/streaming')
  await page.getByRole('button', { name: /Collega Google Drive/ }).click()

  await expect(page.getByText('Song of the Sea', { exact: true })).toBeVisible()
  await expect(page.getByText('Brooklyn Nine-Nine · S7E2', { exact: true })).toBeVisible()
  await expect
    .poll(() => db.tables.user_streaming.find((r) => r.drive_file_id === 'video-song-0001')?.titolo)
    .toBe('Song of the Sea')
  await expect
    .poll(() => db.tables.user_streaming.find((r) => r.drive_file_id === 'video-b99-00001')?.titolo)
    .toBe('Brooklyn Nine-Nine')
})

test('un film che non parte (un MKV che il browser non apre) lo dice e propone Drive', async ({ page }) => {
  await page.clock.install()
  await conLettoreCiak(page)
  await mockDrive(page, { sottotitoliNellaCartella: true })

  await apriSongOfTheSea(page)
  await expect(page.locator('video')).toBeVisible()
  // Il video resta «in caricamento» senza mai dare errore: dopo 20 s si avvisa.
  await page.clock.runFor(21_000)

  const avviso = page.getByRole('alert')
  await expect(avviso).toContainText('Il browser non riesce ad aprire questo file')
  await avviso.getByRole('button', { name: 'Usa il lettore di Drive' }).click()
  await expect(page.locator('iframe')).toBeVisible()
})

test('le cartelle dentro Ciak diventano le schede della videoteca', async ({ page }) => {
  await mockDrive(page)
  await page.goto('/streaming')
  await page.getByRole('button', { name: /Collega Google Drive/ }).click()

  const schede = page.getByRole('tablist', { name: 'Categorie della videoteca' })
  await expect(schede.getByRole('tab')).toHaveText(['Tutto 2', 'Film 1', 'Serie TV 1'])

  // «FILM» è una categoria, non il titolo di un film: il file dentro una
  // cartella di categoria prende il suo nome, non «FILM».
  await expect(page.getByText('B99 S7E2', { exact: true })).toBeVisible()
  await expect(page.getByText('FILM', { exact: true })).toHaveCount(0)

  await schede.getByRole('tab', { name: /Serie TV/ }).click()
  await expect(page.getByText('B99 S7E2', { exact: true })).toBeVisible()
  await expect(page.getByText('Song of the Sea (2014) [1080p]', { exact: true })).toHaveCount(0)

  // La scheda scelta resta scelta alla prossima apertura.
  await page.reload()
  await expect(page.getByRole('tab', { name: /Serie TV/ })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByText('Song of the Sea (2014) [1080p]', { exact: true })).toHaveCount(0)
})
