# Test end-to-end

Test che guidano un browser vero (Chromium via Playwright) sull'app, come
farebbe una persona: clic, digitazione, navigazione.

## Come girano

```bash
npm run test:e2e        # esegue tutta la suite
npm run test:e2e:ui     # modalità interattiva, utile per capire un fallimento
npx playwright test browse.spec.ts -g "Carica altri"   # un singolo caso
```

Playwright avvia da solo il dev server di Vite sulla porta 4173: non serve
farlo partire a mano.

## Perché non servono chiavi né account

La suite è **ermetica**: `e2e/support/mocks.ts` intercetta ogni chiamata
uscente e risponde con dati finti.

- **TMDB** — cataloghi, ricerca, generi e schede dei titoli
- **Supabase** — sessione di login e tabelle REST
- **Immagini** — un PNG 1×1, così nessun poster viene scaricato davvero

Ne consegue che i test sono deterministici (nessuna dipendenza da cosa è
popolare oggi su TMDB), veloci e sicuri: in CI girano senza alcun segreto del
repository, e non toccano mai dati reali di un utente.

Le chiavi passate al dev server (`playwright.config.ts`) sono volutamente
fasulle: servono solo a far credere all'app di essere configurata.

## Come sono organizzati

| File | Copre |
| --- | --- |
| `browse.spec.ts` | Sfoglia anime/cartoni: "Carica altri", ordinamento, filtro per genere |
| `navigation.spec.ts` | Home, accesso alle pagine personali, redirect, 404, ricerca → scheda titolo |
| `support/mocks.ts` | Intercettazione TMDB/Supabase e login simulato |
| `support/fixtures.ts` | Dati finti, con titoli numerati per verificare l'ordine |

I cataloghi finti usano titoli numerati (`Anime 1`, `Cartone 2`, …) così un
test può affermare non solo *che* i titoli ci sono, ma che sono **nell'ordine
giusto** — il cuore dei bug di paginazione già corretti in passato.

## Aggiungere un test

```ts
test('descrizione in italiano di ciò che l’utente vede', async ({ page }) => {
  await mockSupabase(page)          // sempre: evita chiamate reali
  await mockTmdb(page, { /* … */ }) // dati per questo scenario
  await signIn(page)                // solo se serve un utente loggato

  await page.goto('/…')
  await expect(page.getByRole('…')).toBeVisible()
})
```

Preferisci i locator per **ruolo e testo visibile**
(`getByRole('button', { name: 'Carica altri' })`) alle classi CSS: restano
validi quando cambia lo stile e falliscono quando cambia davvero ciò che
l'utente vede.
