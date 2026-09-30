import { test, expect, type Page } from '@playwright/test'
import { mockTmdb, mockSupabase, signIn } from './support/mocks'

// «Streaming»: i film nella cartella «Ciak» di Google Drive, riprodotti col
// lettore di Drive. Ermetico — Google Identity Services, l'API Drive e il
// lettore sono tutti mockati: niente rete, niente vero login Google.

const CARTELLA = 'application/vnd.google-apps.folder'

// Risponde alle query di Drive come farebbe un Drive con:
//   Ciak/B99 S7E2.mp4
//   Ciak/Song of the Sea (2014) [1080p]/Song.of.the.Sea.2014.1080p.mkv
async function mockDrive(page: Page, { conCartellaCiak = true } = {}) {
  await page.route('https://www.googleapis.com/drive/v3/files*', (route) => {
    const q = new URL(route.request().url()).searchParams.get('q') ?? ''
    let files: unknown[] = []
    if (q.includes("name = 'Ciak'")) {
      files = conCartellaCiak ? [{ id: 'cartella-ciak', name: 'Ciak' }] : []
    } else if (q.includes(CARTELLA)) {
      files = q.includes("'cartella-ciak' in parents")
        ? [{ id: 'cartella-song', name: 'Song of the Sea (2014) [1080p]' }]
        : []
    } else if (q.includes("mimeType contains 'video/'")) {
      files = [
        {
          id: 'video-song-0001',
          name: 'Song.of.the.Sea.2014.1080p.mkv',
          size: '2147483648',
          mimeType: 'video/x-matroska',
          parents: ['cartella-song'],
        },
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

  // Aprendo il film si va alla pagina del player, grande, col lettore di Drive.
  await page.getByRole('button', { name: /Song of the Sea/ }).click()
  await expect(page).toHaveURL(/\/streaming\/video-song-0001$/)
  await expect(page.getByRole('heading', { name: 'Song of the Sea (2014) [1080p]' })).toBeVisible()
  await expect(page.locator('iframe')).toHaveAttribute(
    'src',
    'https://drive.google.com/file/d/video-song-0001/preview',
  )
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
