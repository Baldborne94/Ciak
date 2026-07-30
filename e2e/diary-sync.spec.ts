import { test, expect } from '@playwright/test'
import { mockTmdb, mockSupabase, mockAiApi, signIn, E2E_USER } from './support/mocks'
import { movieDetail } from './support/fixtures'

// Coerenza fra le due fonti di verità di "ciò che hai guardato": le visioni
// datate (user_diary) e la scheda del titolo (user_titles). Le due pagine devono
// raccontare la stessa storia — un voto o un "visto" non deve mai sparire.

function watchedTitle(over: Record<string, unknown> = {}) {
  return {
    id: 'row-1',
    user_id: E2E_USER.id,
    tmdb_id: 550,
    media_type: 'movie',
    title: 'Fight Club',
    poster_path: '/p.jpg',
    status: 'watched',
    is_favorite: false,
    personal_rating: 4.5,
    notes: null,
    watched_at: '2025-03-01T00:00:00Z',
    genre_ids: [18],
    rewatch: false,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    ...over,
  }
}

test.beforeEach(async ({ page }) => {
  await signIn(page)
  await mockAiApi(page)
})

test('registrare una visione senza stelle NON cancella il voto già dato al titolo', async ({
  page,
}) => {
  // Il bug: salvando una visione senza voto, il ricalcolo partiva dal diario
  // (che non aveva voti) e azzerava il personal_rating in user_titles — il voto
  // dell'utente sparuto senza che lui avesse toccato le stelle.
  await mockTmdb(page, { detail: movieDetail(550, 'Fight Club') })
  const db = await mockSupabase(page, { user_titles: [watchedTitle({ personal_rating: 4.5 })] })
  await page.goto('/title/movie/550')

  await page.getByRole('button', { name: /Segna nel diario/ }).click()
  // Registro solo la data, senza toccare le stelle.
  await page.getByRole('button', { name: /Salva nel diario/ }).click()
  await expect(page.getByText(/Salvato nel diario/)).toBeVisible()

  // La visione è registrata…
  await expect.poll(() => db.tables.user_diary?.length ?? 0).toBe(1)
  // …e il voto del titolo è ancora lì.
  expect((db.tables.user_titles[0] as Record<string, unknown>).personal_rating).toBe(4.5)
})

test('togliere il voto da una visione già registrata aggiorna il titolo', async ({ page }) => {
  // Il contrario del caso sopra: qui il voto viene davvero rimosso da una
  // visione esistente, quindi il titolo deve allinearsi.
  await mockTmdb(page)
  const db = await mockSupabase(page, {
    user_titles: [watchedTitle({ personal_rating: 4 })],
    user_diary: [
      {
        id: 'd1',
        user_id: E2E_USER.id,
        tmdb_id: 550,
        media_type: 'movie',
        title: 'Fight Club',
        poster_path: '/p.jpg',
        watched_on: '2025-03-01',
        rating: 4,
        note: null,
        created_at: '2025-03-01T00:00:00Z',
      },
    ],
  })
  await page.goto('/diario')

  // Ri-cliccando il voto attuale lo si azzera.
  await page.getByRole('button', { name: '4 stelle', exact: true }).first().click()

  await expect
    .poll(() => (db.tables.user_diary[0] as Record<string, unknown>).rating)
    .toBeNull()
  await expect
    .poll(() => (db.tables.user_titles[0] as Record<string, unknown>).personal_rating)
    .toBeNull()
})

test('nel diario un titolo segnato "Visto" mostra il check anche se ha una recensione', async ({
  page,
}) => {
  await mockTmdb(page)
  await mockSupabase(page, {
    user_titles: [watchedTitle()],
    user_diary: [
      {
        id: 'd1',
        user_id: E2E_USER.id,
        tmdb_id: 550,
        media_type: 'movie',
        title: 'Fight Club',
        poster_path: '/p.jpg',
        watched_on: '2025-03-01',
        rating: 4.5,
        note: 'Che film',
        created_at: '2025-03-01T00:00:00Z',
      },
    ],
  })
  await page.goto('/diario')

  // Una riga sola (la visione), che porta sia la recensione sia il check "Visto".
  await expect(page.getByText('Che film')).toBeVisible()
  await expect(page.getByText('✓ Visto')).toBeVisible()
})

test('il voto del titolo si vede nel diario anche se la visione non ne ha uno', async ({ page }) => {
  // Le due pagine si parlano: il voto sta in user_titles, la visione nel diario
  // non ha stelle — il diario mostra comunque il voto invece di stelle vuote.
  await mockTmdb(page)
  await mockSupabase(page, {
    user_titles: [watchedTitle({ personal_rating: 5 })],
    user_diary: [
      {
        id: 'd1',
        user_id: E2E_USER.id,
        tmdb_id: 550,
        media_type: 'movie',
        title: 'Fight Club',
        poster_path: '/p.jpg',
        watched_on: '2025-03-01',
        rating: null,
        note: null,
        created_at: '2025-03-01T00:00:00Z',
      },
    ],
  })
  await page.goto('/diario')

  await expect(page.getByText('Fight Club')).toBeVisible()
  // 5/5 accanto alle stelle: il voto arriva dalla scheda del titolo.
  await expect(page.getByText('5/5')).toBeVisible()
})
