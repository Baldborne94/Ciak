import { test, expect } from '@playwright/test'
import { mockTmdb, mockSupabase, signIn } from './support/mocks'
import { browsePage } from './support/fixtures'

// La chiave TMDB stava nel bundle: chiunque aprisse gli strumenti da
// sviluppatore poteva copiarla. Ora sta sul server e il browser passa da
// /api/tmdb. Questi test sono la guardia che impedisce di tornare indietro
// senza accorgersene — un `fetch` diretto reintrodurrebbe il problema in
// silenzio, perché funzionerebbe benissimo.

test('il browser non parla mai direttamente con TMDB', async ({ page }) => {
  await signIn(page)
  await mockTmdb(page, { trending: browsePage('trending', 1) })
  await mockSupabase(page)

  const diretti: string[] = []
  page.on('request', (req) => {
    const host = new URL(req.url()).host
    // image.tmdb.org non chiede chiavi: le locandine restano dirette, farle
    // passare da noi significherebbe pagarne la banda.
    if (host === 'api.themoviedb.org') diretti.push(req.url())
  })

  await page.goto('/')
  await page.getByRole('link', { name: 'Cerca' }).first().click()
  await page.waitForLoadState('networkidle')

  expect(diretti).toEqual([])
})

// La riga di stato del catalogo, e non quella di Supabase accanto: entrambe
// dicono «Connesso», e un locator generico passerebbe anche col catalogo rotto.
function rigaCatalogo(page: import('@playwright/test').Page) {
  return page.getByText('TMDB (catalogo)').locator('..')
}

test('le Impostazioni verificano il catalogo invece di dichiararlo', async ({ page }) => {
  await signIn(page)
  await mockTmdb(page)
  await mockSupabase(page)

  await page.goto('/settings')
  // Lo stato arriva da una risposta del server, non da una variabile del
  // bundle: se il server non avesse la chiave, qui si leggerebbe il contrario.
  await expect(rigaCatalogo(page)).toContainText('Connesso')
})

test('il catalogo non configurato sul server lo dice, invece di tacere', async ({ page }) => {
  await signIn(page)
  await mockTmdb(page)
  await mockSupabase(page)
  // Il proxy senza TMDB_API_KEY risponde così.
  await page.route('**/api/tmdb*', (route) =>
    route.fulfill({
      status: 503,
      json: { error: 'Catalogo non configurato (manca TMDB_API_KEY lato server).' },
    }),
  )

  await page.goto('/settings')
  await expect(rigaCatalogo(page)).toContainText('Non configurato')
})
