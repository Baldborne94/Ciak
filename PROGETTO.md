# 🎬 CineVault — Documentazione del progetto

Il tuo archivio personale di cinema: traccia **film, serie TV, anime e cartoni**, gestisci liste e preferiti, ricevi **raccomandazioni AI** e sblocca **trofei** mentre guardi. Estetica da sala cinematografica: sala buia, oro proiettore, rosso sipario, ciak come logo.

> App live: <https://ciak.vercel.app>

---

## 📑 Indice

1. [Stack tecnologico](#-stack-tecnologico)
2. [Funzionalità](#-funzionalità)
3. [Architettura e struttura](#-architettura-e-struttura)
4. [Database (Supabase)](#-database-supabase)
5. [Variabili d'ambiente](#-variabili-dambiente)
6. [Setup passo-passo](#-setup-passo-passo)
7. [Sistema trofei e temi](#-sistema-trofei-e-temi)
8. [Tassonomia anime / cartoni / film](#-tassonomia-anime--cartoni--film)
9. [Cronologia del lavoro](#-cronologia-del-lavoro)
10. [Roadmap](#-roadmap)

---

## 🧱 Stack tecnologico

| Layer | Tecnologia |
|---|---|
| Frontend | React + Vite + TypeScript + Tailwind CSS |
| Catalogo | [TMDB API](https://developer.themoviedb.org) (dati live, nessuna copia locale) |
| Dati personali | [Supabase](https://supabase.com) (Postgres + Auth + Row Level Security) |
| Raccomandazioni AI | [Anthropic API](https://www.anthropic.com) (serverless, lato server) |
| Deploy | [Vercel](https://vercel.com) |
| Routing | React Router v6 |

---

## ✨ Funzionalità

### 🏠 Homepage (Sala) — personale
- **Statistiche reali** da Supabase: visti, da vedere, in corso, preferiti
- **▶️ Continua a guardare** — i titoli "In corso"
- **🎟️ Da vedere** — la watchlist
- **✨ Suggeriti per te** — striscia AI on-demand risolta in card TMDB reali
- **🔥 Di tendenza** — una riga compatta dei titoli del momento
- Stati vuoti dedicati per ospiti e utenti senza titoli

### 🔍 Ricerca
- Ricerca **bilingue** (italiano + inglese in parallelo, risultati uniti e de-duplicati)
- Filtri combinabili: tipo (film/serie), voto minimo

### 🧭 Esplora
- **Generi**: sfoglia film/serie per genere, ordina per popolarità / voto / data / incassi, con paginazione
- **Attori**: cerca una persona → profilo con bio, età, luogo di nascita e filmografia completa
- **Studi**: cerca uno studio di produzione → tutti i suoi film

### 🎞️ Scheda titolo dettagliata
- Backdrop, locandina, trama, generi, voto
- **Scheda tecnica**: regista/creatore, titolo e lingua originale, stato, paese, stagioni/episodi, durata, budget e incassi
- **Studi di produzione** cliccabili (con logo) → pagina studio
- **Cast** cliccabile → profilo persona e filmografia
- Raccomandazioni TMDB ("se ti è piaciuto, guarda anche")
- Link al sito ufficiale

### 📺 Cataloghi dedicati
- **Anime**: animazione giapponese
- **Cartoni**: serie animate occidentali (Scooby-Doo, Tom & Jerry, …)

### 🔐 Autenticazione
- Supabase Auth: email/password + Google OAuth (opzionale)
- Rotte `/lists/*`, `/favorites` e `/trophies` protette da login

### 📋 Liste personali
- Stati: **Visto**, **Da vedere**, **In corso**, **Abbandonato**
- Assegnabili dalla scheda titolo, salvati su Supabase con RLS

### ❤️ Preferiti
- Voto personale **1–5 ★** e **note** modificabili
- Ordinabili per voto / data / titolo

### ✨ Raccomandazioni AI
- Serverless `/api/recommendations` — chiave Anthropic **mai esposta al browser**
- Legge i tuoi preferiti e i titoli visti per suggerire il prossimo film

### 🏆 Trofei e gamification
- 20 trofei con rarità (bronzo / argento / oro / platino)
- Badge equipaggiabile che cambia avatar, titolo profilo e **tema dell'app**
- Toast animato allo sblocco

---

## 🗂️ Architettura e struttura

```
api/
  recommendations.ts        Serverless Anthropic (lato server, chiave protetta)
public/
  ciak.svg                  Favicon ciak
supabase/
  schema.sql                Schema base: user_titles, user_preferences + RLS
  schema_v2_achievements.sql Trofei: user_achievements, user_profile + genre_ids
src/
  components/
    Layout.tsx              Shell con Navbar, footer, toast trofei
    Navbar.tsx              Navigazione + badge attivo
    MediaCard.tsx           Card di un risultato TMDB
    MediaGrid.tsx           Griglia di MediaCard
    MediaRow.tsx            Riga orizzontale (MediaRow / ScrollRow) — layout condiviso
    SavedTitleCard.tsx      Card di una riga salvata (Supabase)
    TitleActions.tsx        Bottoni stato + preferito, trigger trofei
    AchievementToast.tsx    Notifica trofeo sbloccato
    RequireAuth.tsx         Guardia rotte protette
    PageHeader.tsx          Intestazione pagina
    States.tsx              Loader / EmptyState / ErrorState
  lib/
    tmdb.ts                 Client TMDB (trending, search, discover, persone, studi, dettaglio)
    supabase.ts             Client Supabase
    auth.tsx                AuthProvider + useAuth
    userTitles.ts           CRUD liste/preferiti, stats, trofei
    achievements.ts         Definizione 20 trofei + logica condizioni
    achievementsContext.tsx Context trofei: toast, badge attivo, tema
    types.ts                Tipi condivisi
  pages/
    Dashboard.tsx           Homepage personale
    Search.tsx              Ricerca bilingue
    Explore.tsx             Esplora (generi / attori / studi)
    GenrePage.tsx           Risultati per genere con ordinamento
    PersonPage.tsx          Profilo persona + filmografia
    StudioPage.tsx          Film di uno studio
    CatalogPage.tsx         Catalogo generico (anime / cartoni)
    TitleDetail.tsx         Scheda titolo dettagliata
    ListPage.tsx            Lista per stato
    Favorites.tsx           Preferiti con voto e note
    Recommendations.tsx     Raccomandazioni AI
    TrophiesPage.tsx        Trofei e badge profilo
    Settings.tsx            Stato integrazioni
    Login.tsx               Accesso / registrazione
    NotFound.tsx            404
  App.tsx                   Rotte
  main.tsx                  Provider (Auth + Achievements) + Router
```

### Principio chiave
> Le schede mostrano i dati TMDB **in tempo reale**: nessuna copia locale del catalogo. Solo i dati **personali** (stato, voto, note, preferiti, trofei) finiscono su Supabase.

---

## 🗄️ Database (Supabase)

### `schema.sql` — base
- **`user_titles`** — interazioni personali con un titolo (stato, preferito, voto, note, `watched_at`, `genre_ids`). Vincolo unico `(user_id, tmdb_id, media_type)`.
- **`user_preferences`** — generi/lingue preferite per calibrare l'AI.
- Trigger `set_updated_at()` su entrambe.
- **RLS**: ogni utente vede e modifica solo le proprie righe.

### `schema_v2_achievements.sql` — trofei
- Aggiunge `genre_ids integer[]` a `user_titles` (per i trofei per genere).
- **`user_achievements`** — trofei sbloccati `(user_id, achievement_id)`.
- **`user_profile`** — badge attivo scelto dall'utente.
- RLS su entrambe.

> ⚠️ Vanno eseguiti **entrambi** gli script nel SQL Editor di Supabase, nell'ordine: prima `schema.sql`, poi `schema_v2_achievements.sql`.

---

## 🔑 Variabili d'ambiente

| Variabile | Dove | Note |
|---|---|---|
| `VITE_TMDB_API_KEY` | TMDB → Settings → API | chiave v3 |
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API | Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase → API → **Legacy anon key** (`eyJ…`) | client browser |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) | **senza** prefisso `VITE_` — solo server |

> 🔒 `ANTHROPIC_API_KEY` non deve **mai** avere il prefisso `VITE_`: resta lato server nella serverless function, mai esposta al browser.

---

## 🚀 Setup passo-passo

### 1. Supabase
1. Crea un progetto (piano free = 2 progetti per account).
2. SQL Editor → esegui `supabase/schema.sql`.
3. SQL Editor → esegui `supabase/schema_v2_achievements.sql`.
4. Project Settings → API → copia **Project URL** e **Legacy anon key**.
5. (Opzionale) Authentication → URL Configuration → **Site URL** = `https://ciak.vercel.app` e Additional Redirect URLs = `https://ciak.vercel.app/**`.
6. (Opzionale) Google OAuth: Authentication → Providers → Google (richiede Client ID/Secret da Google Cloud Console).

### 2. Vercel
1. Importa il repo `Baldborne94/Ciak`.
2. Aggiungi le 4 variabili d'ambiente (vedi tabella sopra).
3. Deploy. `vercel.json` gestisce le rewrite SPA e la function in `/api`.

### 3. Locale
```bash
npm install
cp .env.example .env   # inserisci le chiavi
npm run dev            # http://localhost:5173
```

| Comando | Cosa fa |
|---|---|
| `npm run dev` | Server di sviluppo |
| `npm run build` | Type-check + build di produzione |
| `npm run typecheck` | Solo type-check |
| `npm run lint` | ESLint |
| `npm run preview` | Anteprima della build |

---

## 🏆 Sistema trofei e temi

I trofei si calcolano lato client (`achievements.ts`) sui dati Supabase e si sbloccano dopo ogni azione su un titolo (`checkAndUnlockAchievements`).

### Categorie di trofei
- **Milestone**: 1 / 10 / 25 / 50 / 100 titoli visti
- **Genere**: horror ("Il Mostro"), action, sci-fi, romance, comedy, fantasy, crime, thriller, anime ("Otaku"), western, drama
- **Speciali**: collezionista (15 preferiti), critico (10 voti), perfezionista (5× cinque stelle), recensore (5 note), binge master (3 serie in corso)

### Badge e temi dinamici
Equipaggiando un trofeo dalla pagina **Trofei** cambiano:
- l'**avatar** e il **titolo** nel profilo / navbar
- il **tema visivo** dell'app (10 palette via CSS variables: horror, sci-fi, fantasy, anime, romance, action, gold, platinum, western, crime)

Il tema attivo persiste in `localStorage`.

---

## 🎭 Tassonomia anime / cartoni / film

| Categoria | Definizione | Filtro TMDB |
|---|---|---|
| **Anime** | Animazione giapponese | `discover/tv`, genere 16, `original_language=ja` |
| **Cartoni** | Serie animate occidentali (Scooby-Doo, Tom & Jerry) | `discover/tv`, genere 16, `original_language=en`, `vote_count ≥ 20` |
| **Film d'animazione** | Lungometraggi animati (Re Leone, Pixar) | restano tra i **Film** ordinari |

---

## 📜 Cronologia del lavoro

| Fase | Contenuto | Stato |
|---|---|---|
| 1 | Scaffold: catalogo TMDB, client Supabase, schema SQL, serverless AI | ✅ su `main` |
| 3 | Autenticazione Supabase + liste e preferiti persistiti | ✅ su `main` |
| — | Cataloghi Anime e Cartoni | ✅ su `main` (PR #4) |
| — | Dashboard a sezioni + ultime uscite | ✅ su `main` (PR #4) |
| — | Sistema trofei, badge profilo, temi dinamici | ✅ su `main` (PR #4) |
| — | Esplora (genere/attore/studio) + scheda titolo arricchita | ✅ su `main` (PR #4) |
| — | Ricerca bilingue (IT + EN) | ✅ su `main` (PR #4) |
| — | Home personale + tassonomia animazione corretta | 🔄 PR #5 |

---

## 🗺️ Roadmap

1. ✅ Setup progetto
2. ✅ Ricerca e scheda dettaglio (live su TMDB)
3. ✅ Sistema liste su Supabase + Auth
4. ✅ Preferiti con voto e note
5. ✅ Dashboard con statistiche reali
6. ✅ Raccomandazioni AI collegate ai dati utente
7. ✅ Trofei, badge e temi dinamici
8. ✅ Esplora per genere / attore / studio
9. ✅ Ricerca bilingue
10. ✅ Dove guardarlo (streaming IT) + trailer nella scheda
11. ✅ Profilo di gusto (statistiche personali)
12. ✅ Liste personali tematiche
13. ⏳ Diario di visione (timeline con date e rivisioni)
14. ⏳ Preferenze utente (`user_preferences`) e filtri avanzati (anno, lingua, paese)
15. ⏳ Suggerimenti AI automatici con caching

### Idee in coda (da valutare)
- 💿 **Ricerca film per canzone** — "questa canzone in quali film è stata usata?" (via AI, TMDB non ha dati colonne sonore)
- 🎬 **Ordine di visione delle saghe** — numerazione "ordine consigliato" + eventuale ordine cronologico-storia (via AI dove differisce dall'uscita)

---

_Generato durante lo sviluppo di CineVault. Dati forniti da [TMDB](https://www.themoviedb.org)._
