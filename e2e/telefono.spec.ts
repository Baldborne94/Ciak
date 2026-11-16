import { test, expect, type Locator, type Page } from '@playwright/test'
import { mockTmdb, mockSupabase, mockAiApi, signIn, E2E_USER } from './support/mocks'
import { browsePage, movie, movieDetail, collectionDetail } from './support/fixtures'

// Sul telefono il mouse non c'è: un comando che compare solo passandoci sopra
// non si vede, e quindi non si usa. Le ✕ di «Continua la saga» erano così,
// insieme al «+» delle locandine e alle ✕ di diario e liste. Qui si guarda la
// pagina come la vede un dito: emulazione mobile, tocco, niente hover.

const TELEFONO = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }

const opacita = (l: Locator) =>
  l.evaluate((el) => {
    let o = 1
    for (let e: Element | null = el; e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity)
    return o
  })

function riga(tmdbId: number, title: string, status: string, over: Record<string, unknown> = {}) {
  return {
    id: `r-${tmdbId}`, user_id: E2E_USER.id, tmdb_id: tmdbId, media_type: 'movie', title, poster_path: '/p.jpg', status,
    is_favorite: false, personal_rating: 4, watched_at: '2026-08-01T00:00:00Z', genre_ids: [27],
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-08-01T00:00:00Z', ...over,
  }
}

async function conSaga(page: Page) {
  await signIn(page)
  await mockAiApi(page)
  await mockTmdb(page, {
    detail: movieDetail(700, 'Hellraiser', { belongs_to_collection: { id: 900 } }),
    collection: collectionDetail(900, {
      name: 'Hellraiser Collection',
      parts: [movie(700, 'Hellraiser', { release_date: '1987-09-11' }), movie(701, 'Hellbound: Hellraiser II', { release_date: '1988-12-23' })],
    }),
  })
  await mockSupabase(page, { user_titles: [riga(700, 'Hellraiser', 'watched')] })
  await page.goto('/')
  return page.locator('section', { hasText: 'Continua la saga' }).first()
}

test.describe('sul telefono', () => {
  test.use(TELEFONO)

  test('la ✕ di «Continua la saga» si vede e, toccata, toglie la saga', async ({ page }) => {
    const saga = await conSaga(page)
    await expect(saga.getByText('Hellbound: Hellraiser II')).toBeVisible()
    await expect(saga.getByText(/tocca ✕ sulla locandina/)).toBeVisible()
    const x = saga.getByRole('button', { name: 'Non mi interessa continuare questa saga' })
    expect(await opacita(x)).toBe(1)
    // Abbastanza grande da prenderla col dito.
    const box = (await x.boundingBox())!
    expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(36)
    await x.tap()
    await expect(page.getByText('Hellbound: Hellraiser II')).toHaveCount(0)
  })

  test('il «+» delle azioni rapide si vede su ogni locandina', async ({ page }) => {
    await signIn(page)
    await mockTmdb(page, { discover: () => browsePage('Scoperta', 1) })
    await mockSupabase(page, { user_titles: [] })
    await page.goto('/genre/movie/27')
    const piu = page.getByRole('button', { name: 'Azioni rapide' }).first()
    await expect(piu).toBeVisible()
    expect(await opacita(piu)).toBe(1)
  })

  test('nel diario le stelle si possono toccare una mezza alla volta, e la ✕ si vede', async ({ page }) => {
    await signIn(page)
    await mockTmdb(page)
    await mockSupabase(page, {
      user_titles: [riga(550, 'Fight Club', 'watched')],
      user_diary: [{ id: 'd-1', user_id: E2E_USER.id, tmdb_id: 550, media_type: 'movie', title: 'Fight Club', poster_path: '/p.jpg', watched_on: '2026-08-01', rating: 4, note: null, created_at: '2026-08-01T10:00:00Z' }],
    })
    await page.goto('/diario')
    const mezza = page.getByRole('button', { name: '3.5 stelle' }).first()
    await expect(mezza).toBeVisible()
    // Prima erano 8×16 pixel: col dito si prendeva la stella accanto.
    const box = (await mezza.boundingBox())!
    expect(box.width).toBeGreaterThanOrEqual(13)
    expect(box.height).toBeGreaterThanOrEqual(26)
    const x = page.getByRole('button', { name: 'Rimuovi dal diario' }).first()
    await expect(x).toBeVisible()
    expect(await opacita(x)).toBe(1)
  })
})

test.describe('col mouse', () => {
  test('la ✕ resta nascosta finché non si passa sopra la locandina', async ({ page }) => {
    const saga = await conSaga(page)
    const x = saga.getByRole('button', { name: 'Non mi interessa continuare questa saga' })
    await expect(saga.getByText('Hellbound: Hellraiser II')).toBeVisible()
    expect(await opacita(x)).toBe(0)
    await saga.getByText('Hellbound: Hellraiser II').hover()
    await expect.poll(() => opacita(x)).toBe(1)
  })
})
