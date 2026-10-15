import { test, expect, type Page, type Request } from '@playwright/test'
import { mockTmdb, mockSupabase, signIn } from './support/mocks'

// Si entra solo con email e password: l'accesso con Google non c'è più. Chi
// entrava con Google la password la sceglie dalle Impostazioni, sullo stesso
// account; chi l'ha dimenticata se ne fa mandare una nuova per email.

const recuperoDa = (page: Page) =>
  page.waitForRequest((r: Request) => r.url().includes('/auth/v1/recover') && r.method() === 'POST')
const nuovaPasswordDa = (page: Page) =>
  page.waitForRequest((r: Request) => r.url().endsWith('/auth/v1/user') && r.method() === 'PUT')

async function scegliPassword(page: Page, password: string) {
  await page.getByLabel('Nuova password').fill(password)
  await page.getByLabel('Ripetila').fill(password)
  await page.getByRole('button', { name: 'Salva la password' }).click()
}

test.beforeEach(async ({ page }) => {
  await mockTmdb(page)
  await mockSupabase(page)
})

test('la pagina di accesso non offre più Google, e la password dimenticata arriva per email', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('button', { name: /Accedi/ }).first()).toBeVisible()
  await expect(page.getByText(/Google/)).toHaveCount(0)

  // Senza email non c'è a chi mandarla: lo si dice.
  await page.getByRole('button', { name: 'Password dimenticata?' }).click()
  await expect(page.getByText('Scrivi la tua email qui sopra')).toBeVisible()

  await page.getByPlaceholder('tu@esempio.com').fill('spettatore@ciak.test')
  const richiesta = recuperoDa(page)
  await page.getByRole('button', { name: 'Password dimenticata?' }).click()
  expect((await richiesta).postDataJSON()).toMatchObject({ email: 'spettatore@ciak.test' })
  await expect(page.getByText(/Ti ho mandato un'email a spettatore@ciak\.test/)).toBeVisible()
})

test('dalle Impostazioni chi entrava con Google sceglie la password, sullo stesso account', async ({ page }) => {
  await signIn(page)
  await page.goto('/settings')
  const accesso = page.locator('section').filter({ has: page.getByRole('heading', { name: '🔑 Accesso' }) })
  await expect(accesso).toContainText('spettatore@ciak.test')

  const richiesta = nuovaPasswordDa(page)
  await scegliPassword(page, 'popcorn-1979')
  expect((await richiesta).postDataJSON()).toMatchObject({ password: 'popcorn-1979' })
  await expect(accesso.getByRole('status')).toContainText('Password salvata')
})

test('dal link dell’email si entra e si sceglie subito la password nuova', async ({ page }) => {
  // Così torna Supabase dal link di «Password dimenticata?» (flusso implicito).
  await page.goto('/#access_token=e2e-recupero&expires_in=3600&refresh_token=e2e-r&token_type=bearer&type=recovery')
  const finestra = page.getByRole('dialog', { name: 'Scegli la password nuova' })
  await expect(finestra).toBeVisible()

  const richiesta = nuovaPasswordDa(page)
  await scegliPassword(page, 'popcorn-1979')
  expect((await richiesta).postDataJSON()).toMatchObject({ password: 'popcorn-1979' })
  await expect(finestra).toHaveCount(0)
  await expect(page.getByText(/Password salvata/)).toBeVisible()
})
