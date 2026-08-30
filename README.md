# 🎬 CineVault

Il tuo archivio personale di cinema. Esplora un catalogo sempre aggiornato di **film, serie TV, anime e cartoni**, gestisci le tue liste e ricevi **raccomandazioni AI** su misura per i tuoi gusti.

Estetica da sala cinematografica: tema scuro, oro proiettore, rosso sipario, ciak come logo. 🍿

## Stack

| Layer | Tecnologia |
|---|---|
| Frontend | React + Vite + TypeScript + Tailwind |
| Catalogo | [TMDB API](https://developer.themoviedb.org) (dati live) |
| Dati personali | [Supabase](https://supabase.com) (Postgres + Auth + RLS) |
| Raccomandazioni AI | [Anthropic API](https://www.anthropic.com) (lato server) |
| Deploy | [Vercel](https://vercel.com) |

## Funzionalità

- 🎞️ **Dashboard "Sala"** con trending TMDB e **statistiche personali reali** (visti, da vedere, in corso, preferiti)
- 🔍 **Ricerca** con filtri combinabili (tipo, voto minimo)
- 🎭 **Scheda dettaglio** con backdrop, locandina, generi, durata, cast e raccomandazioni
- 🔐 **Autenticazione Supabase** (email/password + Google OAuth)
- 📋 **Liste personali** (Visti / Da vedere / In corso) salvate su Supabase — assegna lo stato dalla scheda titolo
- ❤️ **Preferiti** con **voto (1–5 ★)** e **note** modificabili, ordinabili per voto/data/titolo
- 🌙 **"Stasera"** — consigli AI in base a umore e tempo a disposizione, serverless `/api/tonight`, chiave Anthropic mai esposta al browser
- 📖 **Diario di visione** — registro unico (Visti + diario datato) con voto inline e note per visione
- ⚙️ **Impostazioni** con stato delle integrazioni

> Le schede titolo mostrano i dati TMDB in tempo reale: nessuna copia locale del catalogo. Solo i dati personali (stato, voto, note, preferiti) finiscono su Supabase.

## Avvio rapido

```bash
npm install
cp .env.example .env   # inserisci le tue chiavi
npm run dev
```

Apri http://localhost:5173. Senza chiavi l'app parte comunque, ma le sezioni che chiamano le API mostrano un messaggio d'errore a tema.

### Variabili d'ambiente

Vedi [`.env.example`](./.env.example):

| Variabile | Dove |
|---|---|
| `TMDB_API_KEY` | [TMDB → API](https://www.themoviedb.org/settings/api) — lato server, senza `VITE_` |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | Supabase → Project Settings → API |
| `ANTHROPIC_API_KEY` | [Anthropic Console](https://console.anthropic.com) — **solo server**, niente prefisso `VITE_` |

## Database

Esegui [`supabase/schema.sql`](./supabase/schema.sql) nel SQL Editor di Supabase. Crea le tabelle `user_titles` e `user_preferences` con **Row Level Security** (ogni utente vede solo i propri dati) e trigger `updated_at` automatici.

## Script

| Comando | Cosa fa |
|---|---|
| `npm run dev` | Server di sviluppo |
| `npm run build` | Type-check + build di produzione |
| `npm run typecheck` | Solo type-check |
| `npm run lint` | ESLint |
| `npm test` | Test unitari e dei componenti (Vitest) — circa 5 secondi |
| `npm run test:e2e` | Test end-to-end (Playwright) su un browser vero |
| `npm run test:e2e:ui` | Gli stessi E2E in modalità interattiva |
| `npm run preview` | Anteprima della build |

## Test

Tre livelli, tutti eseguiti dalla CI su ogni pull request:

- **Unitari** (`src/lib/*.test.ts`, `api/*.test.ts`) — logica pura: statistiche,
  avvisi, cache, filtri, titoli leggibili, e le autorizzazioni delle funzioni
  serverless.
- **Componenti** (`src/components/*.test.tsx`) — un componente alla volta in
  jsdom: il voto a mezza stella, la trappola del focus di un modale, un avviso
  che deve tacere. Girano in millisecondi, quindi si possono tenere accesi
  mentre si scrive (`npm run test:watch`).
- **End-to-end** (`e2e/*.spec.ts`) — l'app in Chromium: ogni schermata si apre
  e ogni azione principale (segnare uno stato, votare, registrare una visione,
  creare liste, filtrare, chiedere un avviso) fa davvero ciò che promette.

I primi due insieme durano circa cinque secondi, gli E2E un quarto d'ora: vale
la pena scegliere il livello più basso che sappia rispondere alla domanda.

I test E2E sono **ermetici**: TMDB, Supabase e le immagini sono intercettati e
sostituiti con dati finti, quindi non servono chiavi né account e i risultati
non dipendono da cosa è popolare oggi. Una guardia
(`e2e/routes-coverage.spec.ts`) fa fallire la CI se una schermata viene
aggiunta senza il suo test. Dettagli in [`e2e/README.md`](./e2e/README.md).

## Struttura

```
api/                  Serverless function (raccomandazioni Anthropic, lato server)
public/ciak.svg       Favicon ciak
supabase/schema.sql   Schema DB con RLS
src/
  components/         Layout, Navbar, MediaCard/Grid, SavedTitleCard,
                      TitleActions, RequireAuth, PageHeader, stati
  lib/                TMDB, Supabase, auth (context), userTitles (CRUD), tipi
  pages/              Dashboard, Search, TitleDetail, ListPage, Favorites,
                      DiaryPage, TonightPage, Settings, Login, NotFound
```

### Autenticazione e dati

L'accesso usa **Supabase Auth** (email/password o Google OAuth). Tutte le query a `user_titles` passano per le policy **RLS**: ogni utente legge e scrive solo le proprie righe. Le rotte `/lists/*` e `/favorites` richiedono il login; le schede titolo e la ricerca restano pubbliche.

> Per Google OAuth, abilita il provider in Supabase → Authentication → Providers e aggiungi l'URL dell'app tra i redirect consentiti.

## Roadmap

1. ✅ Setup progetto
2. ✅ Ricerca e scheda dettaglio (live su TMDB)
3. ✅ Sistema liste su Supabase + Auth
4. ✅ Preferiti con voto e note
5. ✅ Dashboard con statistiche reali
6. ✅ Raccomandazioni AI collegate ai dati utente
7. Preferenze utente (`user_preferences`) e filtri avanzati (anime/cartoni, anno, genere, lingua)

## Deploy su Vercel

Importa il repo, imposta le variabili d'ambiente (incluse le `VITE_*` e `ANTHROPIC_API_KEY`), e Vercel userà [`vercel.json`](./vercel.json) per le rewrite SPA e la function in `/api`.
