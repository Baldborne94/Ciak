import { test, expect } from '@playwright/test'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// Guardia della copertura: confronta le rotte dichiarate in src/App.tsx con
// gli indirizzi effettivamente visitati dai test E2E. Se qualcuno aggiunge una
// schermata senza scriverne il test, questa verifica fallisce e dice quale
// manca — così "ogni schermata è coperta" resta vero nel tempo, invece di
// essere una promessa che si sgretola a ogni modifica.

const here = dirname(fileURLToPath(import.meta.url))
const appTsx = readFileSync(join(here, '..', 'src', 'App.tsx'), 'utf8')

// Rotte dichiarate: <Route path="..."> più la index route ("/").
function declaredRoutes(): string[] {
  const paths = [...appTsx.matchAll(/<Route\s+[^>]*path="([^"]+)"/g)].map((m) => m[1])
  const hasIndex = /<Route\s+index\b/.test(appTsx)
  const all = paths.filter((p) => p !== '*') // la 404 si verifica a parte
  if (hasIndex) all.unshift('/')
  return [...new Set(all)].map((p) => (p.startsWith('/') ? p : `/${p}`))
}

// Indirizzi visitati: ogni page.goto('/...') nelle spec.
function visitedUrls(): string[] {
  const urls: string[] = []
  for (const file of readdirSync(here).filter((f) => f.endsWith('.spec.ts'))) {
    const src = readFileSync(join(here, file), 'utf8')
    for (const m of src.matchAll(/page\.goto\(\s*'([^']+)'/g)) urls.push(m[1])
  }
  return urls
}

// "/genre/:type/:genreId" → regex che accetta "/genre/movie/27".
function routeMatcher(route: string): RegExp {
  const pattern = route
    .split('/')
    .map((seg) => (seg.startsWith(':') ? '[^/]+' : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('/')
  return new RegExp(`^${pattern}$`)
}

test('ogni schermata dichiarata in App.tsx ha almeno un test E2E', () => {
  const visited = visitedUrls().map((u) => u.split('?')[0].split('#')[0])
  const uncovered = declaredRoutes().filter(
    (route) => !visited.some((url) => routeMatcher(route).test(url)),
  )

  expect(
    uncovered,
    `Schermate senza test E2E: ${uncovered.join(', ')}.\n` +
      `Aggiungi un test che faccia page.goto() su ciascuna (vedi e2e/README.md).`,
  ).toEqual([])
})

test('la pagina 404 e le rotte dichiarate restano allineate', () => {
  // Sanity check della guardia stessa: se App.tsx cambiasse forma e la regex
  // non trovasse più nulla, il test sopra passerebbe a vuoto.
  expect(declaredRoutes().length).toBeGreaterThan(15)
  expect(visitedUrls().length).toBeGreaterThan(15)
})
