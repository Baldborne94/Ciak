import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // La logica testata è pura (nessun DOM): l'ambiente node basta ed è veloce.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
