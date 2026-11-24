import { test, expect, type Page } from '@playwright/test'
import { mockTmdb, mockSupabase, signIn } from './support/mocks'

// «Sul dispositivo»: le copie salvate in Ciak si tolgono da lì, una serie
// intera con un tocco. Prima solo episodio per episodio, dal lettore: per i 21
// episodi di South Park sul tablet, 21 volte.

async function salva(page: Page, copie: { id: string; titolo: string; serie: string | null }[]) {
  await page.evaluate(async (copie) => {
    const cache = await caches.open('ciak-film-v1')
    for (const c of copie) {
      await cache.put(`/film-offline/${c.id}`, new Response('video', { headers: { 'Content-Type': 'video/mp4' } }))
      const info = { id: c.id, titolo: c.titolo, file: `${c.id}.mp4`, dimensione: 300 * 1024 ** 2, stato: 'completo', serie: c.serie }
      await cache.put(`/film-offline/${c.id}/info.json`, new Response(JSON.stringify(info), { headers: { 'Content-Type': 'application/json' } }))
    }
  }, copie)
}

const nelleCache = (page: Page) =>
  page.evaluate(async () => (await (await caches.open('ciak-film-v1')).keys()).map((r) => new URL(r.url).pathname).sort())

test('una serie salvata in Ciak si toglie dal dispositivo con un tocco, e non si ricopia', async ({ page }) => {
  await signIn(page)
  await mockTmdb(page)
  await mockSupabase(page, { user_streaming: [] })
  await page.goto('/streaming')
  await salva(page, [
    { id: 'loc-0000000000000001', titolo: 'South Park · S3E1', serie: 'South Park' },
    { id: 'loc-0000000000000002', titolo: 'South Park · S3E2', serie: 'South Park' },
    { id: 'loc-0000000000000003', titolo: 'Paprika', serie: null },
  ])
  // La serie era tenuta in Ciak: tolta, non deve tornare alla prossima lettura.
  await page.evaluate(() =>
    localStorage.setItem('ciak:serie-in-ciak', JSON.stringify({ 'SERIE TV/South Park': { titolo: 'South Park', liberaDopoVisione: true } })),
  )
  await page.reload()

  const elenco = page.getByRole('heading', { name: /Sul dispositivo/ }).locator('..')
  await expect(elenco.getByText('2 episodi · 600 MB')).toBeVisible()
  let domanda = ''
  page.once('dialog', (d) => {
    domanda = d.message()
    void d.accept()
  })
  await elenco.getByRole('button', { name: 'Elimina «South Park» dal dispositivo' }).click()

  await expect(elenco.getByText('South Park', { exact: true })).toHaveCount(0)
  await expect(elenco.getByText('Paprika')).toBeVisible()
  expect(domanda).toContain('Va via le copie dei 2 episodi salvati in Ciak')
  expect(await nelleCache(page)).toEqual(['/film-offline/loc-0000000000000003', '/film-offline/loc-0000000000000003/info.json'])
  expect(await page.evaluate(() => localStorage.getItem('ciak:serie-in-ciak'))).toBe('{}')
})
