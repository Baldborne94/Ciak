import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// L'E2E della CI gira nel container ufficiale di Playwright, che porta il
// SUO Chromium: se il container e @playwright/test hanno versioni diverse, il
// test cerca un browser che lì non c'è e cade prima di partire. Aggiornando
// Playwright si aggiorna anche l'immagine in ci.yml: questo lo ricorda.

const radice = new URL('../../', import.meta.url)

describe('il container dell’E2E segue la versione di Playwright', () => {
  it('l’immagine in ci.yml è quella di @playwright/test nel package-lock', () => {
    const lock = JSON.parse(readFileSync(new URL('package-lock.json', radice), 'utf8'))
    const versione: string = lock.packages['node_modules/@playwright/test'].version
    const ci = readFileSync(new URL('.github/workflows/ci.yml', radice), 'utf8')
    const immagine = /mcr\.microsoft\.com\/playwright:v([\d.]+)-/.exec(ci)?.[1]
    expect(immagine).toBe(versione)
  })

  it('nessun passo riscarica il browser con apt', () => {
    const ci = readFileSync(new URL('.github/workflows/ci.yml', radice), 'utf8')
    expect(ci).not.toMatch(/playwright install --with-deps/)
  })
})
