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

La suite ha due strati: uno che verifica che **ogni schermata si apra** e uno
che verifica che **le azioni facciano la cosa giusta**.

| File | Copre |
| --- | --- |
| `pages-public.spec.ts` | Ogni schermata raggiungibile senza login (home, cerca, genere, titolo, persona, studio, saga, guida, login, impostazioni, pagine condivise) |
| `pages-auth.spec.ts` | Ogni schermata che richiede il login (preferiti, diario, statistiche, profilo di gusto, liste, in arrivo, trofei, AI, liste di stato) |
| `title-actions.spec.ts` | I pulsanti della scheda titolo: stato, preferito, "da rivedere", rimozione dalla collezione |
| `diary-and-lists.spec.ts` | Registrare/votare/modificare/eliminare una visione; creare, riempire, svuotare e condividere le liste |
| `filters-and-alerts.spec.ts` | Filtri e ordinamenti (genere, ricerca, filmografia), ricerche recenti, avvisi di uscita, trofei |
| `subgenres.spec.ts` | Sottogeneri: chip per genere, keyword inviate a TMDB in OR, ritorno a "Tutti", keyword sconosciute, esito vuoto |
| `diary-sync.spec.ts` | Coerenza fra diario e scheda del titolo: voti che non si perdono, check "Visto", voto mostrato da entrambe le fonti |
| `browse.spec.ts` | Sfoglia anime/cartoni: "Carica altri", ordinamento, filtro per genere |
| `navigation.spec.ts` | Accesso alle pagine personali, redirect dei vecchi indirizzi, 404, ricerca → scheda titolo |
| `routes-coverage.spec.ts` | **Guardia**: fallisce se una schermata di `App.tsx` non ha alcun test |
| `support/mocks.ts` | Intercettazione TMDB/Supabase/AI e login simulato |
| `support/fixtures.ts` | Dati finti, con titoli numerati per verificare l'ordine |

### La guardia della copertura

`routes-coverage.spec.ts` legge le rotte dichiarate in `src/App.tsx` e le
confronta con gli indirizzi visitati dai test. Aggiungere una schermata senza
scriverne il test fa fallire la CI con un messaggio che nomina la schermata
mancante. È ciò che mantiene vera nel tempo l'affermazione "ogni schermata è
coperta".

### Il finto Supabase ha memoria

`mockSupabase` non si limita a rispondere: interpreta i filtri di PostgREST
(`eq`, `is.null`, `in`, `or`, `order`, `limit`) e **applica le scritture** a
tabelle in memoria. Quindi un test può cliccare "Visto", poi aprire la lista
"Da vedere" e ritrovarci il titolo — come farebbe l'utente.

Torna un oggetto ispezionabile, utile per verificare *cosa* è stato salvato:

```ts
const db = await mockSupabase(page)
// …clic dell'utente…
expect(db.tables.user_titles[0]).toMatchObject({ status: 'watched' })
expect(db.writes).toHaveLength(1)   // quante scritture sono partite
```

I cataloghi finti usano titoli numerati (`Anime 1`, `Cartone 2`, …) così un
test può affermare non solo *che* i titoli ci sono, ma che sono **nell'ordine
giusto** — il cuore dei bug di paginazione già corretti in passato.

## Aggiungere un test

```ts
test('descrizione in italiano di ciò che l’utente vede', async ({ page }) => {
  const db = await mockSupabase(page)  // sempre: evita chiamate reali
  await mockTmdb(page, { /* … */ })    // dati per questo scenario
  await signIn(page)                   // solo se serve un utente loggato

  await page.goto('/…')
  await expect(page.getByRole('…')).toBeVisible()
})
```

Preferisci i locator per **ruolo e testo visibile**
(`getByRole('button', { name: 'Carica altri' })`) alle classi CSS: restano
validi quando cambia lo stile e falliscono quando cambia davvero ciò che
l'utente vede.

Tre trappole già incontrate, per non ricascarci:

- Il match dei nomi è **per sottostringa**: `name: '5 stelle'` cattura anche
  "0.5 stelle". Usa `exact: true` quando il nome può essere contenuto in un
  altro.
- Le voci di elenco non sono sempre pulsanti: nel modale "Aggiungi a lista"
  sono caselle di spunta (`getByRole('checkbox', { name: … })`).
- **L'ordine delle route conta**: in Playwright vince l'ultima registrata.
  Una `page.route()` che ispeziona una richiesta va aggiunta **dopo**
  `mockTmdb`, e deve chiudere con `route.fallback()` per lasciar rispondere il
  mock. Registrandola prima si finisce a testare il mock generico invece del
  proprio scenario — e il test passa senza verificare nulla.
