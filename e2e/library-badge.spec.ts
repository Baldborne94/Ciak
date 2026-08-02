import { test, expect } from '@playwright/test'
import { mockTmdb, mockSupabase, mockAiApi, signIn } from './support/mocks'
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
