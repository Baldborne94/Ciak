import { test, expect } from '@playwright/test'
import { mockTmdb, mockSupabase, mockAiApi, signIn, E2E_USER } from './support/mocks'
import { movie, movieDetail } from './support/fixtures'

// Il badge "✓ Visto" sulle card viene dall'indice della libreria in memoria.
// Questi test verificano che l'indice resti allineato dopo un salvataggio,
// da qualunque strada arrivi.

test.beforeEach(async ({ page }) => {
  await signIn(page)
  await mockAiApi(page)
})

test('segnare "Visto" dalle azioni rapide della card mostra subito il badge', async ({ page }) => {
  await mockTmdb(page, { discover: () => [movie(101, 'Pearl')] })
  const db = await mockSupabase(page)
  await page.goto('/genre/movie/27')

  const card = page.locator('.group', { hasText: 'Pearl' }).first()
  await expect(card).toBeVisible()
  await expect(card.getByText('✓ Visto')).toHaveCount(0)

  await card.getByRole('button', { name: 'Azioni rapide' }).click()
  await card.getByRole('button', { name: '✓ Visto' }).click()

  // Prima il salvataggio, poi il badge: la voce di menu ha la stessa etichetta
  // del badge, quindi asserirlo subito passerebbe anche senza aver salvato.
  await expect.poll(() => db.tables.user_titles?.length ?? 0).toBe(1)
  expect(db.tables.user_titles[0]).toMatchObject({ tmdb_id: 101, status: 'watched' })
  await expect(card.getByText('✓ Visto')).toBeVisible()
})

test('segnare "Visto" dalla scheda si riflette sulle card al ritorno', async ({ page }) => {
  await mockTmdb(page, {
    discover: () => [movie(101, 'Pearl')],
    detail: movieDetail(101, 'Pearl'),
  })
  await mockSupabase(page)

  await page.goto('/genre/movie/27')
  const card = page.locator('.group', { hasText: 'Pearl' }).first()
  await expect(card.getByText('✓ Visto')).toHaveCount(0)

  // Apro la scheda, segno "Visto", torno indietro.
  await page.getByRole('link', { name: /Pearl/ }).first().click()
  await page.getByRole('button', { name: 'Visto', exact: true }).click()
  await expect(page.getByRole('button', { name: '✓ Visto' })).toBeVisible()
  await page.goBack()

  await expect(page.locator('.group', { hasText: 'Pearl' }).first().getByText('✓ Visto')).toBeVisible()
})

test('il badge compare anche oltre le prime 1000 righe della collezione', async ({ page }) => {
  // Supabase tronca le risposte REST a 1000 righe: con una collezione grande,
  // una query non paginata perde i titoli in fondo e il badge non compare pur
  // essendo il titolo salvato — esattamente il caso segnalato.
  const many = Array.from({ length: 1200 }, (_, i) => ({
    id: `row-${String(i).padStart(5, '0')}`,
    user_id: E2E_USER.id,
    tmdb_id: 5000 + i,
    media_type: 'movie',
    title: `Riempitivo ${i}`,
    poster_path: null,
    status: 'watched',
    is_favorite: false,
    personal_rating: null,
    notes: null,
    watched_at: '2025-01-01T00:00:00Z',
    genre_ids: [27],
    rewatch: false,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  }))
  // Bullet Train sta in fondo: con l'ordine per id finisce oltre la prima pagina.
  many.push({
    ...many[0],
    id: 'row-99999',
    tmdb_id: 101,
    title: 'Bullet Train',
  })

  await mockTmdb(page, { discover: () => [movie(101, 'Bullet Train')] })
  await mockSupabase(page, { user_titles: many })
  await page.goto('/genre/movie/27')

  const card = page.locator('.group', { hasText: 'Bullet Train' }).first()
  await expect(card).toBeVisible()
  await expect(card.getByText('✓ Visto')).toBeVisible()
})

test('se il salvataggio rapido fallisce l’utente lo viene a sapere', async ({ page }) => {
  await mockTmdb(page, { discover: () => [movie(101, 'Pearl')] })
  await mockSupabase(page)
  // Il salvataggio va in errore: senza avviso l'utente crede di aver segnato il
  // titolo e non capisce perché il badge non compaia.
  await page.route('**/rest/v1/user_titles**', (route) =>
    route.request().method() === 'GET'
      ? route.fallback()
      : route.fulfill({ status: 500, json: { message: 'boom' } }),
  )

  await page.goto('/genre/movie/27')
  const card = page.locator('.group', { hasText: 'Pearl' }).first()
  await card.getByRole('button', { name: 'Azioni rapide' }).click()
  await card.getByRole('button', { name: '✓ Visto' }).click()

  await expect(page.getByText(/non.*riuscit|errore/i).first()).toBeVisible()
})

test('dopo aver registrato una visione il badge compare subito sulle card', async ({ page }) => {
  // Il sintomo per cui è partita tutta l'indagine: un titolo segnato come
  // visto restava senza badge sulle card. Due cause in fila — la scheda non
  // veniva creata senza voto, e l'indice dei badge non veniva ricaricato.
  await mockTmdb(page, {
    detail: movieDetail(146233, 'Prisoners', {
      recommendations: { results: [movie(550, 'Fight Club')] },
    }),
    searchMulti: [movie(146233, 'Prisoners')],
  })
  await mockSupabase(page, { user_titles: [] })

  await page.goto('/title/movie/146233')
  await page.getByRole('button', { name: /Segna nel diario/ }).click()
  await page.getByRole('button', { name: /Salva nel diario/ }).click()
  await expect(page.getByText(/Salvato nel diario/)).toBeVisible()

  // Senza ricaricare la pagina: cerco il titolo e la sua card deve dirlo.
  await page.goto('/search?q=Prisoners')
  await expect(page.getByText('Prisoners').first()).toBeVisible()
  await expect(page.getByText('✓ Visto').first()).toBeVisible()
})
