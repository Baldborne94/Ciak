import { test, expect } from '@playwright/test'
import { mockTmdb, mockSupabase, mockAiApi, signIn, E2E_USER } from './support/mocks'

// Le ricerche salvate si cancellano in modo ottimistico: la riga sparisce
// subito, prima che il database confermi. Se poi la cancellazione fallisce, la
// riga deve tornare — altrimenti sembra cancellata finché non ricarichi la
// pagina, dove ricompare senza spiegazioni.

function savedSong(key: string, query: string) {
  return {
    id: `song-${key}`,
    user_id: E2E_USER.id,
    query_key: key,
    query,
    results: [],
    created_at: '2025-01-01T00:00:00Z',
  }
}

test.beforeEach(async ({ page }) => {
  await signIn(page)
  await mockTmdb(page)
  await mockAiApi(page)
})

test('se la cancellazione fallisce la ricerca salvata torna al suo posto', async ({ page }) => {
  await mockSupabase(page, {
    user_song_cache: [savedSong('bohemian', 'Bohemian Rhapsody')],
  })
  // Il database rifiuta la cancellazione (registrata dopo il mock generale,
  // questa rotta ha la precedenza).
  await page.route('**/rest/v1/user_song_cache*', (route) => {
    if (route.request().method() === 'DELETE') {
      return route.fulfill({ status: 500, json: { message: 'cancellazione rifiutata' } })
    }
    return route.fallback()
  })

  await page.goto('/ai?tab=song')
  await expect(page.getByText('Bohemian Rhapsody')).toBeVisible()

  // Nome esatto: "Cancella tutte" contiene "Cancella" e verrebbe presa per prima.
  await page.getByRole('button', { name: 'Cancella', exact: true }).click()

  await expect(page.getByText(/Non sono riuscito a cancellarla/)).toBeVisible()
  // Tornata al suo posto: non fingiamo che sia sparita.
  await expect(page.getByText('Bohemian Rhapsody')).toBeVisible()
})

test('quando la cancellazione riesce la ricerca sparisce davvero', async ({ page }) => {
  const db = await mockSupabase(page, {
    user_song_cache: [savedSong('bohemian', 'Bohemian Rhapsody')],
  })

  await page.goto('/ai?tab=song')
  await page.getByRole('button', { name: 'Cancella', exact: true }).click()

  await expect(page.getByText('Bohemian Rhapsody')).toHaveCount(0)
  await expect.poll(() => db.tables.user_song_cache?.length ?? 0).toBe(0)
})
