import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    // La logica pura non ha bisogno di un DOM finto, che costa a ogni file:
    // resta su `node`. Solo i test dei componenti (.tsx) prendono jsdom.
    environment: 'node',
    environmentMatchGlobs: [['src/**/*.test.tsx', 'jsdom']],
    setupFiles: ['./src/test/setup.ts'],
    include: [
      'src/**/*.test.ts',
      // I componenti: coprono in secondi ciò che prima si poteva verificare
      // solo con Playwright, quindici minuti per giro. Non sostituiscono gli
      // E2E — quelli provano l'app vera, con rete e navigazione — ma tolgono
      // loro il lavoro che non richiede un browser intero.
      'src/**/*.test.tsx',
      // Anche le funzioni serverless: la loro logica di autorizzazione è codice
      // come il resto, e finora non la copriva nessuno.
      'api/**/*.test.ts',
    ],
  },
})
