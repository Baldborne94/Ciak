# Ciak — istruzioni per lavorare su questo progetto

Archivio personale di cinema: React + TypeScript, Supabase (dati e login),
TMDB (catalogo), Claude (funzioni AI), deploy su Vercel.

## Regola principale: le modifiche viaggiano coi test

**Ogni cambiamento al comportamento dell'app aggiorna i test nello stesso
commit.** Non è un passaggio facoltativo da rimandare: una modifica senza test
aggiornati è incompleta.

In pratica, quando tocchi qualcosa:

1. **Correggi un bug** → prima scrivi il test che lo riproduce (deve fallire),
   poi correggi (deve passare). Così il bug non può tornare in silenzio.
2. **Aggiungi una schermata** → aggiungi il suo test in `e2e/`. La verifica in
   `e2e/routes-coverage.spec.ts` fallisce da sola se te ne dimentichi.
3. **Cambi un testo, un pulsante o un flusso** → aggiorna i test che lo
   citano. Se un test fallisce dopo una modifica voluta, la risposta giusta è
   aggiornarlo perché descriva il nuovo comportamento — mai cancellarlo o
   indebolirlo per farlo tacere.
4. **Cambi logica pura** (calcoli, filtri, ordinamenti) → coprila con un test
   unitario in `src/lib/*.test.ts`, molto più veloce di un test E2E.

Prima di considerare finito un lavoro, esegui tutto:

```bash
npm run lint && npm run typecheck && npm test && npm run build && npm run test:e2e
```

Sono gli stessi comandi della CI: se passano qui, passano lì.

## I due livelli di test

| | Dove | Cosa copre | Comando |
| --- | --- | --- | --- |
| Unitari (Vitest) | `src/lib/*.test.ts` | Logica pura: statistiche, filtri, cache, avvisi | `npm test` |
| End-to-end (Playwright) | `e2e/*.spec.ts` | L'app in un browser vero: ogni schermata e ogni azione principale | `npm run test:e2e` |

I test E2E sono **ermetici**: TMDB, Supabase e le immagini sono intercettati e
sostituiti con dati finti (`e2e/support/mocks.ts`). Non servono chiavi né
account, non si consumano quote API e i risultati non dipendono da cosa è
popolare oggi. Dettagli in `e2e/README.md`.

Il finto Supabase **ha memoria**: interpreta i filtri di PostgREST e applica le
scritture, quindi un test può salvare qualcosa da una schermata e ritrovarlo in
un'altra. `mockSupabase` torna `{ tables, writes }` per verificare *cosa* è
stato salvato, non solo cosa appare a schermo.

Due guardie automatiche, oltre ai test veri e propri:

- `e2e/routes-coverage.spec.ts` fallisce se una rotta di `App.tsx` non ha
  alcun test — è ciò che rende impossibile aggiungere una schermata scoperta.
- La CI esegue lint, typecheck, unitari, build e E2E su ogni pull request.

## Convenzioni di codice

- **Commenti e testi dell'interfaccia in italiano**; i commenti spiegano il
  *perché* di una scelta, non ciò che il codice già dice.
- `MediaType` (`movie | tv | anime | cartoon`) è ciò che salviamo;
  `TmdbType` (`movie | tv`) è ciò che TMDB accetta. Convertendo, restringi in
  modo esplicito: `const isTv = record.media_type === 'tv'`.
- Gli id TMDB sono unici **solo dentro un tipo**: un film e una serie possono
  condividere lo stesso numero. Per mappe e deduplicazioni usa sempre la chiave
  composta `` `${mediaType}-${id}` `` — dimenticarlo ha già causato bug veri.
- Le liste sfogliabili paginate ordinano **lato server** (`sort_by` di TMDB) e
  si limitano ad accodare le pagine. Riordinare lato client l'elenco già
  accumulato fa "saltare" i titoli già a schermo a ogni "Carica altri".
- I **sottogeneri** (`src/lib/subgenres.ts`) non esistono su TMDB: sono coppie
  «etichetta italiana → keyword TMDB» risolte in id da `resolveKeywordIds` e
  passate a `/discover` come `with_keywords`. Più keyword per lo stesso
  sottogenere stanno in OR, perché i titoli non sono etichettati in modo
  uniforme (`world war ii` e `wwii` convivono).
- La chiave Anthropic vive **solo** lato server (`api/`), mai con prefisso
  `VITE_`.

## Struttura

```
src/pages/       una per schermata (code-split)
src/components/  componenti condivisi
src/lib/         accesso ai dati, TMDB, logica pura (+ test unitari)
api/             funzioni serverless Vercel (AI, cron avvisi)
e2e/             test end-to-end + mock
supabase/        schema SQL e policy
```

## Git

Si lavora su un branch dedicato, mai direttamente su `main`; ogni lavoro
finisce in una pull request con la CI verde prima del merge.
