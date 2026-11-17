import { test, expect } from '@playwright/test'
import { mockTmdb, mockSupabase, signIn } from './support/mocks'
import { browsePage } from './support/fixtures'

// Su un monitor da computer le pagine stavano in una colonna da 1152px, con
// due bande vuote ai lati. Ora arrivano fino a 1920px, e le griglie delle
// locandine aggiungono colonne invece di ingrandire le locandine.

const MONITOR = { width: 1870, height: 1000 }

test.use({ viewport: MONITOR })

test.beforeEach(async ({ page }) => {
  await signIn(page)
  await mockTmdb(page, { discover: () => browsePage('Scoperta', 1) })
  await mockSupabase(page, { user_titles: [] })
})

test('la pagina occupa lo schermo: niente bande vuote ai lati', async ({ page }) => {
  await page.goto('/genre/movie/27')
  const principale = page.locator('main')
  await expect(principale).toBeVisible()
  const titolo = (await page.getByRole('heading', { level: 1 }).boundingBox())!
  // Il contenuto parte vicino al bordo sinistro, non a 360px come prima.
  expect(titolo.x).toBeLessThan(80)
  // E la barra in alto è larga quanto lui: il marchio sta sopra il bordo del contenuto.
  const marchio = (await page.getByRole('link', { name: 'Ciak', exact: true }).boundingBox())!
  expect(Math.abs(marchio.x - titolo.x)).toBeLessThan(4)
})

test('le locandine si dispongono in più colonne invece di diventare enormi', async ({ page }) => {
  await page.goto('/genre/movie/27')
  const card = page.getByRole('link', { name: /^Cartone \d+|Scoperta/ }).first()
  await expect(card).toBeVisible()
  const larghezza = (await card.boundingBox())!.width
  expect(larghezza).toBeLessThan(290)
})
