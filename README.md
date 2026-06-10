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

## Funzionalità (Fase 1 — base)

- 🎞️ **Dashboard "Sala"** con i titoli trending da TMDB e spazio per le statistiche personali
- 🔍 **Ricerca** con filtri combinabili (tipo, voto minimo)
- 🎭 **Scheda dettaglio** con backdrop, locandina, generi, durata, cast e raccomandazioni
- 📋 **Liste** (Visti / Da vedere / In corso) e **Preferiti** — scaffold pronti per Supabase
- ✨ **Raccomandazioni AI** — serverless function `/api/recommendations` con chiave Anthropic mai esposta al browser
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
| `VITE_TMDB_API_KEY` | [TMDB → API](https://www.themoviedb.org/settings/api) |
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
| `npm run preview` | Anteprima della build |

## Struttura

```
api/                  Serverless function (raccomandazioni Anthropic, lato server)
public/ciak.svg       Favicon ciak
supabase/schema.sql   Schema DB con RLS
src/
  components/         Layout, Navbar, MediaCard/Grid, PageHeader, stati
  lib/                Client TMDB, client Supabase, tipi condivisi
  pages/              Dashboard, Search, TitleDetail, ListPage, Favorites,
                      Recommendations, Settings, NotFound
```

## Roadmap

1. ✅ Setup progetto (questa fase)
2. Ricerca e scheda dettaglio (live su TMDB) ✅
3. Sistema liste su Supabase + Auth
4. Preferiti con voto e note
5. Dashboard con statistiche reali
6. Raccomandazioni AI collegate ai dati utente
7. Preferenze utente e filtri avanzati

## Deploy su Vercel

Importa il repo, imposta le variabili d'ambiente (incluse le `VITE_*` e `ANTHROPIC_API_KEY`), e Vercel userà [`vercel.json`](./vercel.json) per le rewrite SPA e la function in `/api`.
