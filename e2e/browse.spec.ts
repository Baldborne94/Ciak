import { test, expect, type Page } from '@playwright/test'
import { mockTmdb, mockSupabase } from './support/mocks'
import { browsePage } from './support/fixtures'

// La sezione Anime/Cartoni di "Cerca" — dove viveva il bug del "Carica altri"
// che ricreava la lista invece di continuarla. Questi test lo bloccano.
// I mock danno a ogni catalogo un prefisso diverso ("Anime 1", "Cartone 1",
// "Pervertito 1"), così i locator restano inequivocabili anche quando la
// schermata mostra due liste sfogliabili insieme.

const cards = (page: Page, label: string) =>
  page.getByRole('link', { name: new RegExp(`^${label} \\d+`) })

// In modalità anime convivono la lista per genere e quella "Pervertito":
// il primo "Carica altri" è quello della lista per genere.
const loadMore = (page: Page) => page.getByRole('button', { name: 'Carica altri' }).first()

test.beforeEach(async ({ page }) => {
  await mockSupabase(page)
})

test('sfoglia gli anime e "Carica altri" ACCODA senza rimescolare', async ({ page }) => {
  const calls = await mockTmdb(page)
  await page.goto('/search?mode=anime')

  const grid = cards(page, 'Anime')
  await expect(grid.first()).toBeVisible()
  const firstPage = await grid.allInnerTexts()
  expect(firstPage).toHaveLength(6)
  expect(firstPage[0]).toContain('Anime 1')

  await loadMore(page).click()

  // I 6 titoli iniziali restano AL LORO POSTO, in cima e nello stesso ordine:
  // è esattamente ciò che "continua la lista" significa per l'utente.
  await expect(grid).toHaveCount(12)
  const afterLoadMore = await grid.allInnerTexts()
  expect(afterLoadMore.slice(0, 6)).toEqual(firstPage)
  expect(afterLoadMore[6]).toContain('Anime 7')
  expect(afterLoadMore[11]).toContain('Anime 12')

  // Nessun duplicato in tutta la lista.
  expect(new Set(afterLoadMore).size).toBe(afterLoadMore.length)

  // Ha chiesto la pagina 2, una volta sola. (Non confrontiamo l'intera
  // sequenza: in sviluppo StrictMode monta gli effetti due volte, quindi la
  // pagina 1 risulta richiesta due volte — comportamento di React, non
  // dell'app, e assente in produzione.)
  const animeCalls = calls.discover.filter((c) => c.label === 'Anime')
  expect(animeCalls.at(-1)?.page).toBe(2)
  expect(animeCalls.filter((c) => c.page === 2)).toHaveLength(1)
  expect(animeCalls.every((c) => c.page <= 2)).toBe(true)
})

test('"Carica altri" non duplica se TMDB ripete un titolo tra le pagine', async ({ page }) => {
  // Simula la volatilità dell'ordinamento TMDB: due titoli della pagina 1
  // ricompaiono nella 2. La lista deve mostrarli una volta sola.
  await mockTmdb(page, {
    discover: (p, params) => {
      const label = params.get('with_original_language') === 'ja' ? 'Anime' : 'Cartone'
      if (p === 1) return browsePage(label, 1)
      return [...browsePage(label, 1).slice(0, 2), ...browsePage(label, 2).slice(0, 4)]
    },
  })
  await page.goto('/search?mode=cartoons')

  const grid = cards(page, 'Cartone')
  await expect(grid.first()).toBeVisible()
  await loadMore(page).click()

  await expect(grid).toHaveCount(10) // 6 + 4 nuovi, i 2 ripetuti scartati
  const titles = await grid.allInnerTexts()
  expect(new Set(titles).size).toBe(titles.length)
})

test('cambiare "Ordina" riparte dalla pagina 1 con il sort chiesto a TMDB', async ({ page }) => {
  const calls = await mockTmdb(page)
  await page.goto('/search?mode=cartoons')

  const grid = cards(page, 'Cartone')
  await expect(grid.first()).toBeVisible()
  await loadMore(page).click()
  await expect(grid).toHaveCount(12)

  await page.getByRole('combobox').filter({ hasText: 'Ordina' }).selectOption('rating_desc')

  // Nuovo ordinamento = lista nuova dalla pagina 1, ordinata da TMDB
  // (server-side: è la correzione che evita il rimescolamento client-side).
  await expect(grid).toHaveCount(6)
  const last = calls.discover.at(-1)!
  expect(last.page).toBe(1)
  expect(last.sortBy).toBe('vote_average.desc')
})

test('con un ordinamento attivo, "Carica altri" non riordina ciò che è già a schermo', async ({
  page,
}) => {
  // Il reclamo originale: «non continua la lista, la ricrea». Succedeva perché
  // l'app riordinava lato client TUTTI i titoli accumulati a ogni "Carica
  // altri". Qui la pagina 2 contiene titoli PIÙ RECENTI della pagina 1: se un
  // riordino client-side per data tornasse, salterebbero in cima e i titoli
  // già visti si sposterebbero. Con l'ordinamento lato server restano dove sono.
  await mockTmdb(page, {
    discover: (p) =>
      browsePage('Cartone', p).map((item, i) => ({
        ...item,
        first_air_date: p === 1 ? `200${i}-01-01` : `202${i}-01-01`,
      })),
  })
  await page.goto('/search?mode=cartoons')

  const grid = cards(page, 'Cartone')
  await expect(grid.first()).toBeVisible()

  await page.getByRole('combobox').filter({ hasText: 'Ordina' }).selectOption('date_desc')
  await expect(grid).toHaveCount(6)
  const before = await grid.allInnerTexts()

  await loadMore(page).click()
  await expect(grid).toHaveCount(12)

  const after = await grid.allInnerTexts()
  expect(after.slice(0, 6)).toEqual(before) // i primi 6 non si sono mossi
  expect(after[6]).toContain('Cartone 7') // i nuovi si sono accodati in fondo
})

test('anche la sezione "Pervertito" rispetta l’ordinamento scelto', async ({ page }) => {
  // Questa era la regressione: il suo fetcher ignorava il selettore "Ordina".
  const calls = await mockTmdb(page)
  await page.goto('/search?mode=anime')
  await expect(cards(page, 'Pervertito').first()).toBeVisible()

  await page.getByRole('combobox').filter({ hasText: 'Ordina' }).selectOption('date_desc')

  await expect
    .poll(() => calls.discover.filter((c) => c.label === 'Pervertito').at(-1)?.sortBy)
    .toBe('first_air_date.desc')
})

test('filtrare per genere ricarica il catalogo dalla pagina 1', async ({ page }) => {
  const calls = await mockTmdb(page)
  await page.goto('/search?mode=cartoons')
  await expect(cards(page, 'Cartone').first()).toBeVisible()

  await page.getByRole('button', { name: 'Commedia' }).click()

  // Il genere scelto si somma ad Animazione (16) nella query a TMDB.
  await expect.poll(() => calls.discover.at(-1)?.genres).toBe('16,35')
  expect(calls.discover.at(-1)?.page).toBe(1)
})

test('il pulsante "Carica altri" sparisce sull’ultima pagina', async ({ page }) => {
  await mockTmdb(page, { discoverTotalPages: 1 })
  await page.goto('/search?mode=cartoons')

  await expect(cards(page, 'Cartone').first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Carica altri' })).toHaveCount(0)
})
