import { test, expect } from '@playwright/test'
import { mockTmdb, mockSupabase, signIn, E2E_USER, TMDB_PROXY, tmdbRequest } from './support/mocks'

// Gli errori "best effort" finivano solo in console.error — cioè in una console
// che nessuno apre. È così che le statistiche sono rimaste sbagliate finché non
// si è notato a occhio che un regista aveva quattro film invece di otto.

function titolo(tmdbId: number, title: string) {
  return {
    id: `t-${tmdbId}`,
    user_id: E2E_USER.id,
    tmdb_id: tmdbId,
    media_type: 'movie',
    title,
    poster_path: '/p.jpg',
    status: 'watched',
    is_favorite: false,
    personal_rating: 4,
    watched_at: '2026-03-01T00:00:00Z',
    genre_ids: [18],
    rewatch: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

function erroreSalvato(id: string, contesto: string, messaggio: string) {
  return {
    id,
    user_id: E2E_USER.id,
    contesto,
    messaggio,
    dettaglio: 'Error: dettaglio tecnico\n  at qualcosa',
    percorso: '/statistiche',
    created_at: '2026-08-30T20:00:00Z',
  }
}

test('un errore vero finisce nel diario, non solo in console', async ({ page }) => {
  await signIn(page)
  await mockTmdb(page)
  const db = await mockSupabase(page, {
    user_titles: [titolo(550, 'Fight Club'), titolo(680, 'Pulp Fiction')],
    client_errors: [],
  })
  // Il catalogo si rompe su una richiesta di dettaglio: è il caso reale, quello
  // che rende «best effort» un dato che sparisce.
  await page.route(TMDB_PROXY, async (route) => {
    const { path } = tmdbRequest(route)
    if (!/^\/(movie|tv)\/\d+$/.test(path)) return route.fallback()
    return route.fulfill({ status: 500, json: { error: 'TMDB giù' } })
  })

  await page.goto('/statistiche')

  await expect
    .poll(() => (db.tables.client_errors ?? []).length, { timeout: 15000 })
    .toBeGreaterThan(0)

  const scritto = db.tables.client_errors[0] as Record<string, string>
  expect(scritto.user_id).toBe(E2E_USER.id)
  // Il contesto dice DOVE, che è metà del valore di una segnalazione.
  expect(scritto.contesto).toBeTruthy()
  expect(scritto.messaggio).toBeTruthy()
})

test('lo stesso errore ripetuto non riempie la tabella', async ({ page }) => {
  await signIn(page)
  await mockTmdb(page)
  const db = await mockSupabase(page, {
    user_titles: [titolo(550, 'Fight Club'), titolo(680, 'Pulp Fiction')],
    client_errors: [],
  })
  await page.route(TMDB_PROXY, async (route) => {
    const { path } = tmdbRequest(route)
    if (!/^\/(movie|tv)\/\d+$/.test(path)) return route.fallback()
    return route.fulfill({ status: 500, json: { error: 'TMDB giù' } })
  })

  await page.goto('/statistiche')
  await expect
    .poll(() => (db.tables.client_errors ?? []).length, { timeout: 15000 })
    .toBeGreaterThan(0)
  await page.waitForTimeout(1500)

  // Molte richieste falliscono allo stesso modo: la diagnostica non deve
  // diventare essa stessa il guasto.
  const firme = new Set(
    (db.tables.client_errors as Record<string, string>[]).map((e) => `${e.contesto} ${e.messaggio}`),
  )
  expect(db.tables.client_errors.length).toBe(firme.size)
  expect(db.tables.client_errors.length).toBeLessThanOrEqual(20)
})

test('le Impostazioni mostrano gli errori, col dettaglio a richiesta', async ({ page }) => {
  await signIn(page)
  await mockTmdb(page)
  await mockSupabase(page, {
    client_errors: [erroreSalvato('e-1', 'anni di uscita', 'TMDB non risponde')],
  })

  await page.goto('/settings')

  await expect(page.getByText('anni di uscita')).toBeVisible()
  await expect(page.getByText('TMDB non risponde')).toBeVisible()
  // Il dettaglio tecnico sta chiuso: serve quando serve, non sempre.
  await expect(page.getByText('dettaglio tecnico')).toHaveCount(0)

  await page.getByRole('button', { name: /TMDB non risponde/ }).click()
  await expect(page.getByText(/dettaglio tecnico/)).toBeVisible()
  await expect(page.getByText('/statistiche')).toBeVisible()
})

test('senza errori lo dice, invece di mostrare un elenco vuoto', async ({ page }) => {
  await signIn(page)
  await mockTmdb(page)
  await mockSupabase(page, { client_errors: [] })

  await page.goto('/settings')
  await expect(page.getByText(/Nessun errore registrato/)).toBeVisible()
})

test('si possono svuotare', async ({ page }) => {
  await signIn(page)
  await mockTmdb(page)
  const db = await mockSupabase(page, {
    client_errors: [erroreSalvato('e-1', 'anni di uscita', 'TMDB non risponde')],
  })

  await page.goto('/settings')
  await page.getByRole('button', { name: /Svuota/ }).click()

  await expect(page.getByText(/Nessun errore registrato/)).toBeVisible()
  await expect.poll(() => db.tables.client_errors.length).toBe(0)
})
