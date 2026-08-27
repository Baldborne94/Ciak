import { test, expect } from '@playwright/test'
import { mockTmdb, mockSupabase, mockAiApi, signIn } from './support/mocks'
import { movie, tv } from './support/fixtures'

// Riconoscimento di un titolo da una foto: la conferma "✓ In «Da vedere»" deve
// riflettere ciò che è finito nel database, non solo il fatto che il pulsante
// sia stato premuto. Un archivio personale che dice "salvato" senza aver
// salvato è peggio di uno che dà errore.

// PNG 1×1 valido: basta a far partire la compressione lato client.
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

async function uploadPhoto(page: import('@playwright/test').Page) {
  await page.goto('/ai?tab=image')
  await page.setInputFiles('input[type="file"]', {
    name: 'locandina.png',
    mimeType: 'image/png',
    buffer: PIXEL,
  })
}

test('se il salvataggio fallisce NON compare la conferma "aggiunto"', async ({ page }) => {
  await signIn(page)
  await mockTmdb(page, { searchMulti: [movie(550, 'Fight Club')] })
  await mockAiApi(page, {
    '/api/identify': {
      titles: [{ title: 'Fight Club', type: 'movie', confidence: 'alta', reason: 'La locandina' }],
      people: [],
    },
  })
  const db = await mockSupabase(page, { user_titles: [] })

  // Il database rifiuta la scrittura (rete giù, policy, colonna mancante…).
  // Registrata dopo il mock generale, questa rotta ha la precedenza.
  await page.route('**/rest/v1/user_titles*', (route) => {
    if (route.request().method() === 'GET') return route.fallback()
    return route.fulfill({ status: 500, json: { message: 'salvataggio rifiutato' } })
  })

  await uploadPhoto(page)
  await page.getByRole('button', { name: /Aggiungi a Da vedere/ }).click()

  // Il fallimento si vede…
  await expect(page.getByText(/Non sono riuscito ad aggiungerlo/)).toBeVisible()
  // …e la spunta bugiarda non c'è.
  await expect(page.getByText('✓ In «Da vedere»')).toHaveCount(0)
  expect(db.tables.user_titles?.length ?? 0).toBe(0)
})

test('quando il salvataggio riesce la conferma compare e la riga è nel database', async ({
  page,
}) => {
  await signIn(page)
  await mockTmdb(page, { searchMulti: [movie(550, 'Fight Club')] })
  await mockAiApi(page, {
    '/api/identify': {
      titles: [{ title: 'Fight Club', type: 'movie', confidence: 'alta', reason: 'La locandina' }],
      people: [],
    },
  })
  const db = await mockSupabase(page, { user_titles: [] })

  await uploadPhoto(page)
  await page.getByRole('button', { name: /Aggiungi a Da vedere/ }).click()

  await expect(page.getByText('✓ In «Da vedere»')).toBeVisible()
  await expect.poll(() => db.tables.user_titles?.length ?? 0).toBe(1)
  expect((db.tables.user_titles[0] as Record<string, unknown>).status).toBe('to_watch')
})

test('un film e una serie con lo stesso id TMDB non si confondono', async ({ page }) => {
  // Gli id TMDB sono unici solo dentro un tipo: con una chiave di soli numeri,
  // aggiungere il film segnava "aggiunto" anche la serie omonima.
  await signIn(page)
  await mockTmdb(page, { searchMulti: [movie(550, 'Fight Club'), tv(550, 'Fight Club - La serie')] })
  await mockAiApi(page, {
    '/api/identify': {
      titles: [
        { title: 'Fight Club', type: 'movie', confidence: 'alta', reason: 'Il film' },
        { title: 'Fight Club', type: 'tv', confidence: 'media', reason: 'La serie' },
      ],
      people: [],
    },
  })
  await mockSupabase(page, { user_titles: [] })

  await uploadPhoto(page)

  const addButtons = page.getByRole('button', { name: /Aggiungi a Da vedere/ })
  await expect(addButtons).toHaveCount(2)
  await addButtons.first().click()

  // Aggiunto uno solo: l'altro deve restare aggiungibile.
  await expect(page.getByText('✓ In «Da vedere»')).toHaveCount(1)
  await expect(addButtons).toHaveCount(1)
})
