import { test, expect } from '@playwright/test'
import { mockTmdb, mockSupabase, signIn } from './support/mocks'
import { movie, tv } from './support/fixtures'

// Percorsi di navigazione e accesso: quello che un ospite vede, dove viene
// rimandato se apre una pagina personale, e come si muove tra le sezioni.

test.beforeEach(async ({ page }) => {
  await mockSupabase(page)
})

test('la home si apre e mostra la barra di navigazione', async ({ page }) => {
  await mockTmdb(page)
  await page.goto('/')

  await expect(page.getByRole('link', { name: '🎬 Ciak' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Cerca', exact: true })).toBeVisible()
  // Nessun errore applicativo in pagina.
  await expect(page.getByText('Qualcosa è andato storto')).toHaveCount(0)
})

test('un ospite che apre una pagina personale finisce sul login', async ({ page }) => {
  await mockTmdb(page)
  await page.goto('/lists/watchlist')

  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('button', { name: /Accedi/ }).first()).toBeVisible()
})

test('un utente autenticato vede la sua watchlist, non il login', async ({ page }) => {
  await mockTmdb(page)
  await signIn(page)
  await mockSupabase(page, {
    user_titles: [
      {
        id: 'row-1',
        user_id: 'e2e-user-0000-0000-000000000000',
        tmdb_id: 550,
        media_type: 'movie',
        title: 'Fight Club',
        poster_path: '/p.jpg',
        status: 'to_watch',
        is_favorite: false,
        personal_rating: null,
        notes: null,
        watched_at: null,
        genre_ids: [18],
        rewatch: false,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      },
    ],
  })

  await page.goto('/lists/watchlist')

  await expect(page).toHaveURL(/\/lists\/watchlist$/)
  await expect(page.getByRole('heading', { name: 'Da vedere' })).toBeVisible()
  await expect(page.getByText('Fight Club')).toBeVisible()
})

test('le vecchie rotte anime/cartoni reindirizzano dentro Cerca', async ({ page }) => {
  await mockTmdb(page)

  await page.goto('/anime')
  await expect(page).toHaveURL(/\/search\?mode=anime$/)

  await page.goto('/cartoons')
  await expect(page).toHaveURL(/\/search\?mode=cartoons$/)
})

test('un URL inesistente mostra la pagina 404, non una schermata bianca', async ({ page }) => {
  await mockTmdb(page)
  await page.goto('/questa-pagina-non-esiste')

  await expect(page.getByText(/404|non trovata|Pagina non/i).first()).toBeVisible()
})

test('dalla ricerca si apre la scheda di un titolo', async ({ page }) => {
  await mockTmdb(page, {
    searchMulti: [movie(550, 'Fight Club'), tv(1399, 'Il Trono di Spade')],
  })
  await page.goto('/search')

  await page.getByPlaceholder(/Cerca un film/).fill('fight')
  await expect(page.getByRole('link', { name: /Fight Club/ })).toBeVisible()

  await page.getByRole('link', { name: /Fight Club/ }).click()

  await expect(page).toHaveURL(/\/title\/movie\/550$/)
  await expect(page.getByRole('heading', { name: /Titolo 550|Fight Club/ }).first()).toBeVisible()
})
