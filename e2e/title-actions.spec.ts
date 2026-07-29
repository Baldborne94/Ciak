import { test, expect } from '@playwright/test'
import { mockTmdb, mockSupabase, mockAiApi, signIn, E2E_USER } from './support/mocks'
import { movieDetail } from './support/fixtures'

// Le azioni sulla scheda di un titolo: stato, preferito, "da rivedere", voto,
// note e diario. È il punto in cui l'utente costruisce la propria collezione,
// quindi qui i test guardano anche *cosa* viene salvato, non solo cosa appare.

test.beforeEach(async ({ page }) => {
  await signIn(page)
  await mockAiApi(page)
  await mockTmdb(page, { detail: movieDetail(550, 'Fight Club') })
})

test('un ospite vede l’invito ad accedere invece dei pulsanti', async ({ page }) => {
  await page.context().clearCookies()
  const fresh = await page.context().newPage()
  await mockTmdb(fresh, { detail: movieDetail(550, 'Fight Club') })
  await mockSupabase(fresh)
  await fresh.goto('/title/movie/550')

  await expect(fresh.getByText(/Accedi.*per aggiungere questo titolo/s)).toBeVisible()
  await expect(fresh.getByRole('button', { name: /Aggiungi ai preferiti/ })).toHaveCount(0)
  await fresh.close()
})

test('segnare "Visto" salva lo stato con la data e lo mostra come attivo', async ({ page }) => {
  const db = await mockSupabase(page)
  await page.goto('/title/movie/550')

  await page.getByRole('button', { name: 'Visto', exact: true }).click()

  // Il pulsante diventa attivo e la riga compare in collezione…
  await expect(page.getByRole('button', { name: '✓ Visto' })).toBeVisible()
  await expect(page.getByText(/Nella tua collezione · stato:/)).toBeVisible()

  // …con lo stato giusto e la data di visione impostata.
  const row = db.tables.user_titles?.[0] as Record<string, unknown>
  expect(row).toMatchObject({ tmdb_id: 550, media_type: 'movie', status: 'watched' })
  expect(row.watched_at).toBeTruthy()
})

test('ri-cliccare lo stato attivo toglie il titolo dalla collezione', async ({ page }) => {
  const db = await mockSupabase(page)
  await page.goto('/title/movie/550')

  await page.getByRole('button', { name: 'Da vedere', exact: true }).click()
  await expect(page.getByRole('button', { name: '✓ Da vedere' })).toBeVisible()

  await page.getByRole('button', { name: '✓ Da vedere' }).click()

  await expect(page.getByText(/Nella tua collezione/)).toHaveCount(0)
  expect(db.tables.user_titles).toHaveLength(0)
})

test('aggiungere ai preferiti implica averlo visto', async ({ page }) => {
  const db = await mockSupabase(page)
  await page.goto('/title/movie/550')

  await page.getByRole('button', { name: /Aggiungi ai preferiti/ }).click()

  await expect(page.getByRole('button', { name: '❤️ Preferito' })).toBeVisible()
  // Lo stato passa a "Visto" da solo: un titolo che ami l'hai guardato.
  await expect(page.getByRole('button', { name: '✓ Visto' })).toBeVisible()
  expect(db.tables.user_titles?.[0]).toMatchObject({ is_favorite: true, status: 'watched' })
})

test('togliere il preferito non cancella lo stato', async ({ page }) => {
  const db = await mockSupabase(page)
  await page.goto('/title/movie/550')

  await page.getByRole('button', { name: /Aggiungi ai preferiti/ }).click()
  await expect(page.getByRole('button', { name: '❤️ Preferito' })).toBeVisible()

  await page.getByRole('button', { name: '❤️ Preferito' }).click()

  await expect(page.getByRole('button', { name: /Aggiungi ai preferiti/ })).toBeVisible()
  await expect(page.getByRole('button', { name: '✓ Visto' })).toBeVisible()
  expect(db.tables.user_titles?.[0]).toMatchObject({ is_favorite: false, status: 'watched' })
})

test('"Rivedi" rimette un film visto nella watchlist senza perdere lo stato', async ({ page }) => {
  const db = await mockSupabase(page, {
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
        watched_at: '2025-01-01T00:00:00Z',
        genre_ids: [18],
        rewatch: false,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      },
    ],
  })
  await page.goto('/title/movie/550')

  await page.getByRole('button', { name: '🔁 Rivedi' }).click()

  await expect(page.getByRole('button', { name: '🔁 Da rivedere' })).toBeVisible()
  const row = db.tables.user_titles[0] as Record<string, unknown>
  expect(row.rewatch).toBe(true)
  expect(row.status).toBe('watched') // lo stato non cambia
})

test('il titolo aggiunto compare poi nella lista corrispondente', async ({ page }) => {
  // Verifica end-to-end del giro completo: salvo dalla scheda, poi apro la
  // lista e lo ritrovo — è ciò che l'utente si aspetta davvero.
  await mockSupabase(page)
  await page.goto('/title/movie/550')

  await page.getByRole('button', { name: 'Da vedere', exact: true }).click()
  await expect(page.getByRole('button', { name: '✓ Da vedere' })).toBeVisible()

  await page.goto('/lists/watchlist')
  await expect(page.getByText('Fight Club')).toBeVisible()
})
