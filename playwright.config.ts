import { defineConfig, devices } from '@playwright/test'

// I test E2E girano contro il dev server di Vite con chiavi FINTE: ogni
// chiamata a TMDB e Supabase è intercettata da e2e/support/mocks.ts, quindi
// la suite è ermetica (nessuna rete, nessun account, risultati deterministici).
const PORT = 4173
const BASE_URL = `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'line' : 'list',
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
    command: `npx vite --port ${PORT} --strictPort`,
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
