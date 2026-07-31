import { test, expect, type Page } from '@playwright/test'
import { mockTmdb, mockSupabase, mockAiApi } from './support/mocks'
import { movie } from './support/fixtures'

// Sottogeneri: scegliere "Antimilitarista" dentro Guerra deve tradursi in una
// richiesta a TMDB filtrata per le keyword giuste, e la lista deve ripartire
// dalla pagina 1 invece di accodarsi a quella del genere intero.
//
// Nota sull'ordine: queste route vanno registrate DOPO mockTmdb, perché in
// Playwright l'ultima registrata vince — al contrario si finirebbe a testare il
// mock generico invece del proprio scenario.

// Risolve i nomi di keyword in id prevedibili, così si può verificare che
// finiscano davvero in with_keywords.
async function mockKeywords(page: Page, ids: Record<string, number>) {
  await page.route('**/search/keyword**', (route) => {
    const q = (new URL(route.request().url()).searchParams.get('query') ?? '').toLowerCase()
    const id = ids[q]
    return route.fulfill({ json: { results: id ? [{ id, name: q }] : [] } })
  })
}

// Raccoglie il valore di with_keywords di ogni richiesta discover (solo quella
// in italiano: l'app ne fa sempre una gemella in inglese per i titoli leggibili).
async function watchKeywordParam(page: Page): Promise<(string | null)[]> {
  const seen: (string | null)[] = []
  await page.route('**/discover/**', async (route) => {
    const u = new URL(route.request().url())
    if (u.searchParams.get('language') !== 'en-US') seen.push(u.searchParams.get('with_keywords'))
    await route.fallback()
  })
  return seen
}

test.beforeEach(async ({ page }) => {
  await mockSupabase(page)
  await mockAiApi(page)
})

test('la pagina di un genere con sottogeneri mostra i suoi chip', async ({ page }) => {
  await mockTmdb(page)
  await page.goto('/genre/movie/10752') // Guerra

  await expect(page.getByText('Sottogenere', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Antimilitarista' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Seconda guerra mondiale' })).toBeVisible()
  // "Tutti" è attivo di partenza: si vede tutto il genere.
  await expect(page.getByRole('button', { name: 'Tutti', exact: true })).toBeVisible()
})

test('un genere senza sottogeneri curati non mostra la riga', async ({ page }) => {
  await mockTmdb(page)
  await page.goto('/genre/movie/10770') // Film TV: nessun sottogenere curato

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByText('Sottogenere', { exact: true })).toHaveCount(0)
})

test('scegliere un sottogenere filtra la richiesta a TMDB per keyword', async ({ page }) => {
  const calls = await mockTmdb(page)
  await mockKeywords(page, { 'anti-war': 1111, antiwar: 2222 })
  const seen = await watchKeywordParam(page)

  await page.goto('/genre/movie/10752')
  await expect(page.getByRole('button', { name: 'Antimilitarista' })).toBeVisible()

  await page.getByRole('button', { name: 'Antimilitarista' }).click()

  // Le due varianti della stessa etichetta viaggiano in OR ("|").
  await expect.poll(() => seen).toContain('1111|2222')
  // E la lista è ripartita dalla pagina 1.
  expect(calls.discover.at(-1)?.page).toBe(1)
})

test('tornando su "Tutti" il filtro per keyword sparisce', async ({ page }) => {
  await mockTmdb(page)
  await mockKeywords(page, { 'anti-war': 1111, antiwar: 2222 })
  const seen = await watchKeywordParam(page)

  await page.goto('/genre/movie/10752')
  await expect(page.getByRole('button', { name: 'Antimilitarista' })).toBeVisible()

  await page.getByRole('button', { name: 'Antimilitarista' }).click()
  await expect.poll(() => seen.some((k) => k !== null)).toBe(true)

  await page.getByRole('button', { name: 'Tutti', exact: true }).click()
  // L'ultima richiesta non porta più il filtro.
  await expect.poll(() => seen.at(-1)).toBeNull()
})

test('una keyword che TMDB non conosce non blocca la ricerca', async ({ page }) => {
  // Se nessuna variante si risolve, mostriamo comunque il genere invece di una
  // pagina vuota inspiegabile.
  await mockTmdb(page, { discover: () => [movie(1, 'Un Film di Guerra')] })
  await mockKeywords(page, {}) // nessun id: tutte le ricerche tornano vuote
  const seen = await watchKeywordParam(page)

  await page.goto('/genre/movie/10752')
  await page.getByRole('button', { name: 'Antimilitarista' }).click()

  await expect(page.getByRole('link', { name: /Un Film di Guerra/ })).toBeVisible()
  expect(seen.every((k) => k === null)).toBe(true)
})

test('un sottogenere senza risultati lo dice, nominandolo', async ({ page }) => {
  await mockTmdb(page, {
    // Con il filtro per keyword TMDB non torna nulla.
    discover: (_page, params) =>
      params.get('with_keywords') ? [] : [movie(1, 'Un Film di Guerra')],
  })
  await mockKeywords(page, { 'anti-war': 1111, antiwar: 2222 })

  await page.goto('/genre/movie/10752')
  await expect(page.getByRole('link', { name: /Un Film di Guerra/ })).toBeVisible()

  await page.getByRole('button', { name: 'Antimilitarista' }).click()

  await expect(page.getByText(/Nessun titolo etichettato «Antimilitarista»/)).toBeVisible()
})
