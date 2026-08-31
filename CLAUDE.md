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
5. **Cambi un componente** (stati, tastiera, cosa compare e cosa no) → provalo
   in `src/components/*.test.tsx`. Sono secondi invece di minuti, quindi si
   possono eseguire a ogni salvataggio.

Prima di considerare finito un lavoro, esegui tutto:

```bash
npm run lint && npm run typecheck && npm test && npm run build && npm run test:e2e
```

Sono gli stessi comandi della CI: se passano qui, passano lì.

## I tre livelli di test

| | Dove | Cosa copre | Comando |
| --- | --- | --- | --- |
| Unitari (Vitest) | `src/lib/*.test.ts`, `api/*.test.ts` | Logica pura: statistiche, filtri, cache, avvisi, autorizzazioni | `npm test` |
| Componenti (Vitest + Testing Library) | `src/components/*.test.tsx` | Un componente da solo: stati, tastiera, cosa compare e cosa no | `npm test` |
| End-to-end (Playwright) | `e2e/*.spec.ts` | L'app in un browser vero: ogni schermata e ogni azione principale | `npm run test:e2e` |

**Scegliere il livello giusto è quasi tutto.** L'intera suite unitaria (compresi
i componenti) gira in circa cinque secondi; quella E2E in un quarto d'ora. Un
comportamento che si può provare senza rete e senza navigazione — un voto a
mezza stella, la trappola del focus di un modale, un avviso che deve tacere —
non merita un browser intero. Gli E2E restano per ciò che solo loro vedono:
navigare fra schermate, salvare davvero e ritrovarlo altrove.

I test dei componenti usano jsdom (`environmentMatchGlobs` in
`vitest.config.ts`, solo per i `.tsx`: la logica pura resta su `node`, che è più
veloce). `src/test/setup.ts` monta i matcher di jest-dom e smonta i componenti
fra un test e l'altro.

Si interroga il DOM **come farebbe una persona** — `getByRole`, `getByLabelText`,
il testo visibile — non per classe CSS: così il test descrive il comportamento e
sopravvive a un cambio di stile, invece di rompersi a ogni ritocco.

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
- Un fallimento «best effort» si passa a `logFailure(contesto)`, mai a un
  `catch {}` vuoto: finisce in console **e** nel diario su Supabase, che le
  Impostazioni mostrano. Un `catch` muto fa sparire un dato senza lasciare
  traccia — è già costato statistiche sbagliate per settimane. Se il fallimento
  si ripete in ciclo, segnalalo **una volta col totale** («47 titoli su 600»),
  non a ogni giro.
- La collezione ha una **copia locale** (`src/lib/offlineCache.ts`): `listAll`
  la salva a ogni lettura riuscita e la serve quando `navigator.onLine` è
  `false` o la rete fallisce. Si controlla `onLine` **prima** di tentare la
  rete, perché aspettare un timeout offline vuol dire fissare una pagina vuota
  per secondi. Chi serve una copia lo dichiara (`segnalaCopia`) e `OfflineBanner`
  lo scrive in cima alla pagina: dati vecchi mostrati senza avvisare rendono
  l'archivio inaffidabile, perché non si può nemmeno sospettare.
- Le chiavi Anthropic e TMDB vivono **solo** lato server (`api/`), mai con
  prefisso `VITE_`: con quel prefisso finiscono nel bundle, dove chiunque le
  copia. Il catalogo passa da `/api/tmdb`, che tiene una **lista dei percorsi
  consentiti**: usare un endpoint TMDB nuovo vuol dire aggiungerlo lì, altrimenti
  la richiesta torna 400. Un proxy che serve tutto è un proxy che useranno al
  posto nostro.

## Struttura

```
src/pages/       una per schermata (code-split)
src/components/  componenti condivisi
src/lib/         accesso ai dati, TMDB, logica pura (+ test unitari)
api/             funzioni serverless Vercel (AI, cron avvisi)
e2e/             test end-to-end + mock
supabase/        schema SQL e policy
```

## Schema del database

I file `supabase/schema_vN_*.sql` si eseguono **a mano** nel SQL Editor di
Supabase, mentre il codice si aggiorna da solo a ogni deploy: i due si possono
separare, ed è già successo (una funzione in produzione prima della sua
tabella).

Per questo esiste il registro `schema_version`. Ogni nuovo file SQL:

1. si chiude registrando la propria versione —
   `insert into public.schema_version (version) values (N) on conflict do nothing;`
2. porta con sé l'aumento di `SCHEMA_RICHIESTO` in `src/lib/schemaVersion.ts`.

Se le due cose non viaggiano insieme il registro mente, che è peggio di non
averlo. Quando il database resta indietro, `SchemaBanner` lo dice in cima a
ogni pagina invece di lasciare che l'utente lo scopra da un salvataggio muto.

Chi aggiunge una tabella con dati dell'utente la aggiunge anche a
`TABELLE_ESPORTATE` (`src/lib/exportData.ts`), altrimenti il backup che
l'utente scarica è silenziosamente incompleto. Cache, contatori e iscrizioni
push restano fuori di proposito.

## Git

Si lavora su un branch dedicato, mai direttamente su `main`; ogni lavoro
finisce in una pull request con la CI verde prima del merge.
