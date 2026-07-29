import { defineConfig, devices } from '@playwright/test'

// I test E2E girano contro il dev server di Vite con chiavi FINTE: ogni
// chiamata a TMDB e Supabase è intercettata da e2e/support/mocks.ts, quindi
// la suite è ermetica (nessuna rete, nessun account, risultati deterministici).
const PORT = 4173
const HOST = '127.0.0.1'
const BASE_URL = `http://${HOST}:${PORT}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Due worker anche in CI: la suite copre ogni schermata, in seriale sarebbe
  // inutilmente lenta. I test sono indipendenti (ognuno ha i suoi mock).
  workers: process.env.CI ? 2 : undefined,
  // In CI affianchiamo il report HTML a quello testuale: è ciò che il workflow
  // carica come artefatto quando un test fallisce.
  reporter: process.env.CI
    ? [['line'], ['html', { open: 'never' }]]
    : [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // In CI usiamo il Chromium scaricato da Playwright; in ambienti che ne
        // hanno già uno (container preconfigurati) basta indicarlo con
        // PLAYWRIGHT_CHROMIUM_PATH per non riscaricarlo.
        ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
          ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } }
          : {}),
      },
    },
  ],
  webServer: {
    // --host esplicito: senza, Vite ascolta su "localhost", che su alcune
    // macchine CI risolve a ::1 (IPv6) mentre Playwright interroga 127.0.0.1,
    // e l'attesa del server scade senza che nulla sia davvero rotto.
    command: `npx vite --host ${HOST} --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      // Chiavi finte: bastano a far credere all'app di essere configurata,
      // le risposte arrivano tutte dai mock.
      VITE_TMDB_API_KEY: 'e2e-fake-tmdb-key',
      VITE_SUPABASE_URL: 'https://e2e-fake.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'e2e-fake-anon-key',
    },
  },
})
