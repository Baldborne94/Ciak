import { test, expect } from '@playwright/test'
import { mockTmdb, mockSupabase, signIn } from './support/mocks'

// Ciò che la pagina chiede fuori da Ciak prima ancora di mostrare qualcosa.
// Il font dei titoli arrivava da Google Fonts: un foglio di stile che blocca
// il disegno della pagina e due server in più da raggiungere a ogni avvio.
// Ora viaggia con l'app, e il browser lo tiene in cache con il resto.

test('il font dei titoli viaggia con l app, senza passare da Google', async ({ page }) => {
  await signIn(page)
  await mockTmdb(page)
  await mockSupabase(page)
  const esterni: string[] = []
  page.on('request', (r) => {
    const host = new URL(r.url()).host
    if (host === 'fonts.googleapis.com' || host === 'fonts.gstatic.com') esterni.push(r.url())
  })

  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Cerca' }).first()).toBeVisible()
  // Il font c'è davvero: senza, i titoli ripiegherebbero su quello di sistema.
  const caricati = await page.evaluate(() => document.fonts.load('1em "Bebas Neue"').then((f) => f.length))
  expect(caricati).toBeGreaterThan(0)
  expect(esterni).toEqual([])
})

test('nessun collegamento anticipato a server che la pagina non usa', async ({ page }) => {
  // Il catalogo passa da /api/tmdb (vedi tmdb-proxy.spec): aprire in anticipo
  // una connessione con api.themoviedb.org era lavoro buttato a ogni avvio.
  await signIn(page)
  await mockTmdb(page)
  await mockSupabase(page)
  await page.goto('/')
  const preconnessi = await page.locator('link[rel="preconnect"]').evaluateAll((l) => l.map((e) => (e as HTMLLinkElement).href))
  expect(preconnessi).toEqual(['https://image.tmdb.org/'])
})
