import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // La logica testata è pura (nessun DOM): l'ambiente node basta ed è veloce.
    environment: 'node',
    // Anche le funzioni serverless: la loro logica di autorizzazione è codice
    // come il resto, e finora non la copriva nessuno.
    include: ['src/**/*.test.ts', 'api/**/*.test.ts'],
  },
})
