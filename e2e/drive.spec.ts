import { test, expect } from '@playwright/test'
import { mockTmdb, mockSupabase, signIn } from './support/mocks'

// "I miei film": streaming dei film tenuti su Google Drive. Ermetico — Google
// Identity Services, l'API Drive e l'anteprima sono tutti mockati, così il test
// non tocca la rete né chiede un vero login Google.

test.beforeEach(async ({ page }) => {
  await signIn(page)
  await mockSupabase(page)
  await mockTmdb(page)

  // Stub di Google Identity Services: niente popup, restituisce subito un token
  // finto quando l'app chiede l'accesso.
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

  // L'API Drive: elenco dei file video dell'utente.
  await page.route('https://www.googleapis.com/drive/v3/files*', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        files: [
          { id: 'v1', name: 'Interstellar.mp4', size: '2147483648', mimeType: 'video/mp4' },
          { id: 'v2', name: 'Akira.mkv', size: '1073741824', mimeType: 'video/x-matroska' },
        ],
      }),
    }),
  )

  // L'anteprima di Drive: stub, così l'iframe non fa una richiesta vera.
  await page.route('https://drive.google.com/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<html><body>anteprima</body></html>' }),
  )
})

test('«I miei film»: collega Drive, elenca i video e apre il player', async ({ page }) => {
  await page.goto('/drive')

  await expect(page.getByRole('heading', { name: 'I miei film' })).toBeVisible()

  // Prima del collegamento c'è solo l'invito a collegare Drive.
  await page.getByRole('button', { name: /Collega Google Drive/ }).click()

  // Dopo il collegamento compaiono i film dal Drive.
  await expect(page.getByText('Interstellar.mp4')).toBeVisible()
  await expect(page.getByText('Akira.mkv')).toBeVisible()

  // Aprendo un film parte il player: l'anteprima di Drive in un iframe, con
  // l'URL giusto (streaming, non download).
  await page.getByRole('button', { name: /Interstellar\.mp4/ }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('iframe')).toHaveAttribute(
    'src',
    'https://drive.google.com/file/d/v1/preview',
  )
})
