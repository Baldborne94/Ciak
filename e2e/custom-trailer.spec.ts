import { test, expect } from '@playwright/test'
import { mockTmdb, mockSupabase, signIn, E2E_USER } from './support/mocks'
import { movieDetail } from './support/fixtures'

// I video su TMDB sono contributi aperti e a volte sono sbagliati: è capitato
// un trailer di Reacher sulla scheda di un altro film. Qui l'utente indica il
// video giusto, e il suo vince su quello del catalogo.

const CHIAVE_TMDB = 'aaaaaaaaaaa'
const CHIAVE_MIA = 'bbbbbbbbbbb'

function dettaglioConTrailer(chiave: string | null) {
  return movieDetail(550, 'Fight Club', {
    videos: {
      results: chiave
        ? [{ key: chiave, site: 'YouTube', type: 'Trailer', official: true }]
        : [],
    },
  })
}

test.beforeEach(async ({ page }) => {
  await signIn(page)
})

test('il trailer scelto da te sostituisce quello di TMDB', async ({ page }) => {
  await mockTmdb(page, { detail: dettaglioConTrailer(CHIAVE_TMDB) })
  const db = await mockSupabase(page, { user_titles: [], user_trailers: [] })

  await page.goto('/title/movie/550')
  // Si parte da quello di TMDB.
  await expect(page.locator(`img[src*="${CHIAVE_TMDB}"]`)).toBeVisible()

  await page.getByRole('button', { name: /Non è quello giusto/ }).click()
  await page.getByLabel(/Link del video YouTube/).fill(`https://youtu.be/${CHIAVE_MIA}`)
  await page.getByRole('button', { name: 'Salva', exact: true }).click()

  await expect(page.getByText('scelto da te')).toBeVisible()
  await expect(page.locator(`img[src*="${CHIAVE_MIA}"]`)).toBeVisible()
  await expect(page.locator(`img[src*="${CHIAVE_TMDB}"]`)).toHaveCount(0)

  // Salvato con la chiave estratta dal link, non col link intero.
  await expect.poll(() => db.tables.user_trailers?.length ?? 0).toBe(1)
  expect((db.tables.user_trailers[0] as Record<string, unknown>).youtube_key).toBe(CHIAVE_MIA)
})

test('un link non riconosciuto non viene salvato', async ({ page }) => {
  await mockTmdb(page, { detail: dettaglioConTrailer(CHIAVE_TMDB) })
  const db = await mockSupabase(page, { user_titles: [], user_trailers: [] })

  await page.goto('/title/movie/550')
  await page.getByRole('button', { name: /Non è quello giusto/ }).click()
  await page.getByLabel(/Link del video YouTube/).fill('https://vimeo.com/123456')
  await page.getByRole('button', { name: 'Salva', exact: true }).click()

  await expect(page.getByText(/Non riconosco questo link/)).toBeVisible()
  expect(db.tables.user_trailers ?? []).toHaveLength(0)
  // E resta quello di TMDB, invece di svuotare la sezione.
  await expect(page.locator(`img[src*="${CHIAVE_TMDB}"]`)).toBeVisible()
})

test('si può tornare al trailer di TMDB', async ({ page }) => {
  await mockTmdb(page, { detail: dettaglioConTrailer(CHIAVE_TMDB) })
  const db = await mockSupabase(page, {
    user_titles: [],
    user_trailers: [
      {
        id: 'ct-1',
        user_id: E2E_USER.id,
        tmdb_id: 550,
        media_type: 'movie',
        youtube_key: CHIAVE_MIA,
        created_at: '2026-01-01T00:00:00Z',
      },
    ],
  })

  await page.goto('/title/movie/550')
  await expect(page.locator(`img[src*="${CHIAVE_MIA}"]`)).toBeVisible()

  await page.getByRole('button', { name: /Usa quello di TMDB/ }).click()

  await expect(page.locator(`img[src*="${CHIAVE_TMDB}"]`)).toBeVisible()
  await expect.poll(() => db.tables.user_trailers?.length ?? 0).toBe(0)
})

test('si può aggiungere un trailer dove TMDB non ne ha nessuno', async ({ page }) => {
  await mockTmdb(page, { detail: dettaglioConTrailer(null) })
  await mockSupabase(page, { user_titles: [], user_trailers: [] })

  await page.goto('/title/movie/550')
  await expect(page.getByText(/Nessun trailer disponibile/)).toBeVisible()

  await page.getByRole('button', { name: /Aggiungi il trailer/ }).click()
  await page.getByLabel(/Link del video YouTube/).fill(CHIAVE_MIA)
  await page.getByRole('button', { name: 'Salva', exact: true }).click()

  await expect(page.locator(`img[src*="${CHIAVE_MIA}"]`)).toBeVisible()
})
