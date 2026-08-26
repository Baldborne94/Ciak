import { test, expect } from '@playwright/test'
import { mockTmdb, mockSupabase, signIn, E2E_USER } from './support/mocks'
import { movieDetail } from './support/fixtures'

// Consigliare un titolo a un'altra persona che usa Ciak: dalla scheda si copia
// un link, e chi lo riceve se lo aggiunge a "Da vedere" con un click, senza
// dover ricercare il film a mano.

// Gli appunti del browser non sono affidabili in headless (permessi, focus):
// intercettiamo writeText per leggere il link che l'app ha davvero prodotto.
async function captureClipboard(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __copied?: string; navigator: Navigator }
    Object.defineProperty(w.navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (t: string) => {
          w.__copied = t
          return Promise.resolve()
        },
      },
    })
    // Senza foglio di condivisione nativo l'app ripiega sugli appunti: è il
    // percorso che vogliamo verificare qui.
    Object.defineProperty(w.navigator, 'share', { configurable: true, value: undefined })
  })
}

test('dalla scheda si copia il link per consigliare il titolo', async ({ page }) => {
  await captureClipboard(page)
  await signIn(page)
  await mockTmdb(page, { detail: movieDetail(550, 'Fight Club') })
  await mockSupabase(page, { user_titles: [] })

  await page.goto('/title/movie/550')
  await page.getByRole('button', { name: /Consiglia a un amico/ }).click()

  await expect(page.getByText(/Link copiato/)).toBeVisible()
  const copied = await page.evaluate(() => (window as unknown as { __copied?: string }).__copied)
  // Il link deve puntare alla pagina del consiglio, non alla scheda normale:
  // è ciò che permette al destinatario di salvarlo con un click.
  expect(copied).toContain('/consiglia/movie/550')
})

test('chi riceve il link aggiunge il titolo alla propria lista "Da vedere"', async ({ page }) => {
  await signIn(page)
  await mockTmdb(page, { detail: movieDetail(550, 'Fight Club') })
  const db = await mockSupabase(page, { user_titles: [] })

  await page.goto('/consiglia/movie/550')

  await expect(page.getByText(/Ti hanno consigliato/)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Fight Club' })).toBeVisible()

  await page.getByRole('button', { name: /Aggiungi a «Da vedere»/ }).click()
  await expect(page.getByText(/È nella tua lista/)).toBeVisible()

  // Salvato davvero, col titolo giusto e nello stato giusto.
  await expect.poll(() => db.tables.user_titles?.length ?? 0).toBe(1)
  const row = db.tables.user_titles[0] as Record<string, unknown>
  expect(row.tmdb_id).toBe(550)
  expect(row.status).toBe('to_watch')
  expect(row.user_id).toBe(E2E_USER.id)
})

test('se il titolo è già in collezione lo dice invece di duplicarlo', async ({ page }) => {
  await signIn(page)
  await mockTmdb(page, { detail: movieDetail(550, 'Fight Club') })
  await mockSupabase(page, {
    user_titles: [
      {
        id: 'row-1',
        user_id: E2E_USER.id,
        tmdb_id: 550,
        media_type: 'movie',
        title: 'Fight Club',
        poster_path: '/p.jpg',
        status: 'watched',
        is_favorite: false,
        personal_rating: null,
        notes: null,
        watched_at: '2025-03-01T00:00:00Z',
        genre_ids: [18],
        rewatch: false,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      },
    ],
  })

  await page.goto('/consiglia/movie/550')

  await expect(page.getByText(/Ce l'hai già in collezione: Visto/)).toBeVisible()
  await expect(page.getByRole('button', { name: /Aggiungi a «Da vedere»/ })).toHaveCount(0)
})

test('un ospite viene invitato ad accedere e torna al consiglio', async ({ page }) => {
  await mockTmdb(page, { detail: movieDetail(550, 'Fight Club') })
  await mockSupabase(page, { user_titles: [] })

  await page.goto('/consiglia/movie/550')

  // Il titolo si vede anche da sloggati: chi riceve il link capisce di cosa si
  // tratta prima di decidere se registrarsi.
  await expect(page.getByRole('heading', { name: 'Fight Club' })).toBeVisible()
  await page.getByRole('button', { name: /Accedi per aggiungerlo/ }).click()
  await expect(page).toHaveURL(/\/login/)
})
