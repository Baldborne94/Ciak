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
- La videoteca vive sul **disco**, non più su Google Drive (tolto del tutto:
  niente collegamento, niente lettore di Drive, niente cestino). Le sorgenti:
  - la **cartella collegata** (E:\Ciak, `src/lib/cartellaLocale.ts`): con File
    System Access (Chrome, Edge sul computer) la maniglia sta in IndexedDB e
    riaprendo il browser il permesso si ridà con un clic («Riapri la
    cartella»): si dice, non si mostra un vuoto. Gli altri browser (Firefox,
    Brave…) non hanno le maniglie: lì la cartella si sceglie con
    `<input webkitdirectory>` e vale per una visita (modo «scelta»).
    `ScegliCartella` usa da sé il modo che c'è: non mostrare mai il pulsante
    solo dove esiste `showDirectoryPicker`;
  - i **film aperti a mano** (`src/lib/filmLocali.ts`), e la loro copia
    salvata in Ciak («Salva in Ciak», `filmOffline.ts`), coi sottotitoli e le
    lingue dell'audio accanto (`vicini`);
  - le **serie tenute in Ciak** (`serieInCiak.ts`, `useSerieInCiak.ts`): il
    dispositivo ricorda la cartella della serie, e a ogni lettura della
    videoteca si copiano gli episodi nuovi e si tolgono le copie dei visti
    (l'originale resta). I «visto» si rileggono anche con la cartella da
    riaprire: sul tablet il permesso si ridà solo quando servono episodi nuovi;
  - il **server di casa** (Jellyfin, `src/lib/jellyfin.ts`), id `jf-<id>`.
  Un video del disco ha id `loc-<impronta>` dal nome e dalla dimensione del
  file: tutto ciò che è legato all'id (`user_streaming`, punto di ripresa,
  episodio dopo) lo ritrova riaprendolo, senza tabelle nuove. La colonna si
  chiama ancora `drive_file_id`, per storia.
- Il lettore prende i **sottotitoli e le lingue dell'audio dai file accanto al
  video** (`FilmAperto.vicini`); un sottotitolo trovato online si salva lì
  accanto se il browser lascia scrivere (`FilmAperto.scrivi`), se no in Ciak
  (`sottotitoliSalvati.ts`).
- **Cancellare dal disco** (`cancellaDalDisco`) toglie per davvero, senza
  Cestino: video, sottotitoli, lingue dell'audio e cartelle rimaste vuote,
  mai la cartella collegata né le schede (`pianoCancellazione.ts`). Chi lo
  chiama chiede conferma e dice che non si recupera. Solo con le maniglie: il
  modo «scelta» lascia solo leggere, e lo si dice.
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
src/lib/         accesso ai dati, logica pura (+ test unitari)
src/lib/tmdb/    il catalogo, diviso per responsabilità
api/             funzioni serverless Vercel (AI, proxy TMDB, cron avvisi)
e2e/             test end-to-end + mock
supabase/        schema SQL e policy
strumenti/       script per il PC dell'utente (preparare i video per la cartella)
```

`src/lib/tmdb.ts` è una **facciata**: ri-esporta e basta. Il codice vero sta in
`src/lib/tmdb/` — `client` (la richiesta al proxy), `raw` (le forme che TMDB
manda e la loro normalizzazione), `titles` (quale titolo è leggibile),
`discover`, `browse`, `detail`, `people`, `collections`, `companies`,
`community` (recensioni e liste pubbliche degli utenti: Letterboxd non ha
un'API pubblica, TMDB sì).

Una funzione nuova va nel modulo giusto e si ri-esporta dalla facciata, così le
pagine continuano a importare da `../lib/tmdb`. Il file era arrivato a 1376
righe perché aggiungere lì era sempre la strada più corta: due test in
`tmdb.test.ts` tengono in piedi la divisione — uno controlla che la facciata
esponga ancora tutto, l'altro che nessun modulo superi le 400 righe. Se un
modulo cresce davvero, si divide ancora; quello che non deve succedere è
tornare alla discarica per inerzia, una funzione alla volta.

Lo stesso vale per le pagine: stanno sotto le 600 righe
(`src/lib/dimensioniPagine.test.ts`). Il lettore e la videoteca erano arrivati
a 1222 e 1044; ora la logica sta in hook (`src/lib/use*.ts`: `useFileDelDisco`,
`useSigleLettore`, `useElencoVideoteca`…), il calcolo puro in `src/lib` coi suoi
test (`elencoVideoteca.ts`) e i pezzi d'interfaccia in `src/components/`. Le
tre pagine ancora oltre il tetto sono eccezioni ferme alla lunghezza di oggi:
possono solo scendere. Una pagina che cresce si divide, non si alza il tetto.

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
