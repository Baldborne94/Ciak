import { test, expect } from '@playwright/test'
import { mockTmdb, mockSupabase, signIn } from './support/mocks'

// Il database di Ciak si aggiorna eseguendo i file SQL a mano, il codice a ogni
// deploy: i due si possono separare. Quando succede, l'app deve dirlo — prima
// che l'utente lo scopra da un salvataggio che non salva.

const AVVISO = /Database da aggiornare/

// Una riga sola per scenario: il finto Supabase ordina confrontando stringhe,
// quindi non è il posto dove verificare «prendi la versione più alta» (in
// Postgres l'ordinamento è numerico). Qui si verifica come reagisce l'app alla
// versione che legge.
function registro(version: number) {
  return [{ id: 'sv-1', version, applied_at: '2026-01-01T00:00:00Z' }]
}

test('nessun avviso quando il database è allineato', async ({ page }) => {
  await signIn(page)
  await mockTmdb(page)
  await mockSupabase(page, { schema_version: registro(16) })

  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: 'Impostazioni' })).toBeVisible()
  await expect(page.getByText(AVVISO)).toHaveCount(0)
})

test('avvisa quando il database è indietro, dicendo di quanto', async ({ page }) => {
  await signIn(page)
  await mockTmdb(page)
  await mockSupabase(page, { schema_version: registro(14) })

  await page.goto('/settings')
  const banda = page.getByRole('status')
  await expect(banda).toContainText(AVVISO)
  // Non basta dire «c'è un problema»: deve dire quale versione c'è, quale
  // serve e dove stanno i file da eseguire.
  await expect(banda).toContainText('v14')
  await expect(banda).toContainText('v16')
  await expect(banda).toContainText('supabase/')
})

test('avvisa anche se il registro delle versioni non esiste', async ({ page }) => {
  await signIn(page)
  await mockTmdb(page)
  await mockSupabase(page)
  // Tabella assente: è il caso di chi non ha ancora eseguito lo schema v16.
  await page.route('**/rest/v1/schema_version*', (route) =>
    route.fulfill({
      status: 404,
      json: { code: '42P01', message: 'relation "public.schema_version" does not exist' },
    }),
  )

  await page.goto('/settings')
  await expect(page.getByRole('status')).toContainText('sconosciuta')
})

test('un errore di rete non diventa un falso allarme', async ({ page }) => {
  await signIn(page)
  await mockTmdb(page)
  await mockSupabase(page)
  // Server giù: non sappiamo nulla dello schema, quindi non diciamo nulla. Un
  // avviso qui manderebbe l'utente a eseguire SQL che non gli servono.
  await page.route('**/rest/v1/schema_version*', (route) =>
    route.fulfill({ status: 500, json: { message: 'Internal Server Error' } }),
  )

  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: 'Impostazioni' })).toBeVisible()
  await expect(page.getByText(AVVISO)).toHaveCount(0)
})

test('a chi non ha fatto l accesso non si parla di schema', async ({ page }) => {
  // Nessun signIn: la guida e le liste condivise si aprono da ospite, e la
  // versione del database non significa niente per chi passa di lì.
  await mockTmdb(page)
  await mockSupabase(page, { schema_version: registro(14) })

  await page.goto('/guida')
  await expect(page.getByText(AVVISO)).toHaveCount(0)
})
