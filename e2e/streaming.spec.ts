import { test, expect, type Page } from '@playwright/test'
import { mockTmdb, mockSupabase, signIn } from './support/mocks'

// «Streaming»: i film nella cartella «Ciak» di Google Drive, riprodotti col
// lettore di Drive. Ermetico — Google Identity Services, l'API Drive e il
// lettore sono tutti mockati: niente rete, niente vero login Google.

const CARTELLA = 'application/vnd.google-apps.folder'

const SRT = '1\n00:00:01,000 --> 00:00:03,000\nC\'era una volta\n'

// I singoli file, come li restituisce files.get.
const FILE: Record<string, unknown> = {
  'video-song-0001': {
    id: 'video-song-0001',
    name: 'Song.of.the.Sea.2014.1080p.mkv',
    size: '2147483648',
    mimeType: 'video/x-matroska',
    parents: ['cartella-song'],
  },
  'cartella-song': {
    id: 'cartella-song',
    name: 'Song of the Sea (2014) [1080p]',
    mimeType: CARTELLA,
    parents: ['cartella-ciak'],
  },
}

// Risponde alle richieste a Drive come farebbe un Drive con:
//   Ciak/B99 S7E2.mp4
//   Ciak/Song of the Sea (2014) [1080p]/Song.of.the.Sea.2014.1080p.mkv
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
      files = q.includes("'cartella-ciak' in parents")
        ? [{ id: 'cartella-song', name: 'Song of the Sea (2014) [1080p]' }]
        : []
    } else if (q.includes("mimeType contains 'video/'")) {
      files = [
        FILE['video-song-0001'],
        {
          id: 'video-b99-00001',
          name: 'B99 S7E2.mp4',
          size: '325058560',
          mimeType: 'video/mp4',
          parents: ['cartella-ciak'],
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
    Object.defineProperty(ServiceWorkerContainer.prototype, 'controller', {
      get: () => ({}),
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
  await page.getByRole('button', { name: /Song of the Sea/ }).click()
  await expect(page).toHaveURL(/\/streaming\/video-song-0001$/)
}

test.beforeEach(async ({ page }) => {
  await signIn(page)
  await mockSupabase(page)
  await mockTmdb(page)

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

  await expect(page.getByRole('heading', { name: 'I miei film' })).toBeVisible()
  await page.getByRole('button', { name: /Collega Google Drive/ }).click()

  // Il film in una sottocartella prende il nome della cartella; l'altro quello
  // del file senza estensione.
  await expect(page.getByText('Song of the Sea (2014) [1080p]')).toBeVisible()
  await expect(page.getByText('B99 S7E2', { exact: true })).toBeVisible()
  await expect(page.getByText(/MKV · 2,0 GB · Song\.of\.the\.Sea/)).toBeVisible()

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
  await expect(page.getByText('Italiano · dalla cartella su Drive')).toBeVisible()
  await expect(page.locator('video track[kind="subtitles"]')).toHaveAttribute('label', 'Italiano')
  // C'era già: niente ricerca online, niente download consumati.
  expect(ricercheOnline).toBe(0)

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
  await expect(page.getByText(/chiesto bytes=1048576- → Drive ha ignorato il Range/)).toBeVisible()
})

test('senza sottotitoli nella cartella li cerca online e li salva accanto al film', async ({ page }) => {
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
          ],
        },
      })
    }
    return route.fulfill({ json: { testo: SRT, rimasti: 9 } })
  })

  await apriSongOfTheSea(page)

  await expect(page.getByText('Italiano · da OpenSubtitles, salvato nella cartella')).toBeVisible()
  // Il film si cerca per titolo e anno, e con l'hash del file per trovare
  // sottotitoli già sincronizzati (qui i pezzi sono zeri: resta la dimensione).
  expect(richieste[0]).toMatchObject({
    azione: 'cerca',
    query: 'Song of the Sea',
    anno: 2014,
    hash: '0000000080000000',
  })
  expect(richieste[1]).toEqual({ azione: 'scarica', fileId: 111 })
  // Salvato nella cartella del film, col nome del video: la volta dopo c'è già.
  expect(scritture).toHaveLength(1)
  expect(scritture[0].corpo).toContain('"name":"Song.of.the.Sea.2014.1080p.it.srt"')
  expect(scritture[0].corpo).toContain('"parents":["cartella-song"]')

  // Fuori sincrono: si passa al candidato dopo e quello scartato va nel cestino.
  await page.getByRole('button', { name: /Prova un altro sottotitolo/ }).click()
  await expect(page.getByText('Inglese · da OpenSubtitles, salvato nella cartella')).toBeVisible()
  expect(richieste[2]).toEqual({ azione: 'scarica', fileId: 222 })
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
