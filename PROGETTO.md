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

### 🔍 Cerca & Esplora (hub unico)
Una sola pagina con schede:
- **Titoli** — ricerca **bilingue** (IT + EN in parallelo, uniti e de-duplicati), ordinati per popolarità; a campo vuoto "Di tendenza ora" + sfoglia per genere; filtri tipo/voto
- **Anime** — animazione giapponese (sezione **😏 Pervertito** a parte per ecchi/hentai)
- **Cartoni** — serie animate occidentali (Scooby-Doo, Tom & Jerry…)
- **Persone** — attori / registi / compositori / sceneggiatori (filtro per ruolo); a campo vuoto "Attori celebri"
- **Studi** — studi di produzione con logo; a campo vuoto "Studi celebri"
- **Saghe** — collezioni/franchise; a campo vuoto "Saghe celebri" (con poster reali)
- **🎵 Canzone → film** — l'AI trova i film che usano una canzone, con la scena

> Anime e Cartoni si possono anche **cercare** per nome IT/EN. I titoli appaiono in **lingua originale** (più facili da cercare sui siti di streaming); gli anime restano leggibili (IT/EN, non in giapponese).

### 🎞️ Scheda titolo dettagliata
- Backdrop, locandina, trama, generi, voto; **titolo originale** + 🇮🇹 italiano se diverso
- **📺 Dove guardarlo** (streaming Italia): piattaforme in abbonamento / noleggio / acquisto + link JustWatch
- **🎬 Trailer** YouTube integrato
- **📺 Stagioni ed episodi** (serie/anime): selettore stagione + episodi in ordine (titolo, data, durata, voto, trama)
- **Scheda tecnica**: regista/creatore, lingua originale, stato, paese, stagioni/episodi, durata, budget e incassi
- **Studi** e **cast** cliccabili; raccomandazioni TMDB; link sito ufficiale

### 🎬 Ordine di visione delle saghe
- Film **numerati** con toggle **📅 Di uscita** ↔ **🤖 Secondo la storia** (ordine-trama via AI)

### 🔐 Autenticazione
- Supabase Auth: email/password + Google OAuth (opzionale)
- Rotte personali protette da login

### 📋 Liste e raccolte
- Liste fisse: **Visto**, **Da vedere**, **In corso**, **Abbandonato** (dalla scheda titolo)
- **🗂️ Liste personali tematiche** create da te ("Neo-noir", "Da vedere con lei"…) — "Aggiungi a lista" dalla scheda
- **📖 Diario di visione** — registra cosa guardi e quando (data, voto, nota, rivisioni)

### ❤️ Preferiti (a sezioni)
- **Titoli** con voto **1–5 ★** e **note** modificabili, ordinabili
- **Persone** e **Studi** preferiti → ritrovi al volo filmografie e produzioni

### 📊 Profilo di gusto
- Generi preferiti, distribuzione voti, cosa guardi (film/serie/anime/cartoni), voto medio, top titoli

### ✨ Raccomandazioni AI
- Serverless `/api/recommendations` — chiave Anthropic **mai esposta al browser**
- Legge preferiti e visti per suggerire il prossimo titolo

### 🏆 Trofei e gamification
- 20 trofei con rarità (bronzo / argento / oro / platino)
- Badge equipaggiabile che cambia avatar, titolo profilo e **tema dell'app**
- Toast animato allo sblocco

---

## 🗂️ Architettura e struttura

```
api/                        Serverless Anthropic (lato server, chiave protetta)
  recommendations.ts        Raccomandazioni personalizzate
  saga-order.ts             Ordine-trama di una saga
  song-films.ts             Film che usano una canzone
public/
  ciak.svg                  Favicon ciak
supabase/
  schema.sql                Base: user_titles, user_preferences + RLS
  schema_v2_achievements.sql Trofei: user_achievements, user_profile + genre_ids
  schema_v3_entities.sql    Preferiti persone/studi: user_entities
  schema_v4_lists_diary.sql Liste tematiche + diario: user_lists, user_list_items, user_diary
src/
  components/
    Layout, Navbar, MediaCard/Grid, MediaRow (caroselli con frecce),
    SavedTitleCard, TitleActions, RequireAuth, PageHeader, States,
    AchievementToast, Modal (popup centrato),
    EntityFavoriteButton (cuore persone/studi),
    AddToListButton, LogDiaryButton, SeasonsSection (stagioni/episodi)
  lib/
    tmdb.ts                 Client TMDB (trending, search bilingue, discover,
                            persone, studi, saghe, stagioni, provider, trailer,
                            displayTitle)
    supabase.ts             Client Supabase
    auth.tsx                AuthProvider + useAuth
    userTitles.ts           CRUD liste/preferiti, stats, trofei, listAll
    entities.ts             CRUD preferiti persone/studi
    lists.ts                CRUD liste personali
    diary.ts                CRUD diario
    achievements.ts / achievementsContext.tsx  Trofei + temi
    types.ts                Tipi condivisi
  pages/
    Dashboard.tsx           Homepage personale
    Search.tsx              Cerca & Esplora (hub: titoli/anime/cartoni/
                            persone/studi/saghe/canzone)
    GenrePage / PersonPage / StudioPage / CollectionPage
    CatalogPage.tsx         Catalogo anime / cartoni
    TitleDetail.tsx         Scheda titolo (provider, trailer, stagioni…)
    ListPage / Favorites / ListsPage / CustomListPage / DiaryPage
    TasteProfile.tsx        Profilo di gusto (statistiche)
    Recommendations / TrophiesPage / Settings / Login / NotFound
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
- Aggiunge `genre_ids integer[]` a `user_titles`.
- **`user_achievements`** (trofei sbloccati) + **`user_profile`** (badge attivo).

### `schema_v3_entities.sql` — preferiti persone/studi
- **`user_entities`** — persone e studi salvati tra i preferiti.

### `schema_v4_lists_diary.sql` — liste tematiche + diario
- **`user_lists`** + **`user_list_items`** — liste personali e i loro titoli.
- **`user_diary`** — registro di visione (data, voto, nota).

> ⚠️ Esegui **tutti e 4** gli script nel SQL Editor di Supabase, in ordine (v1 → v2 → v3 → v4). Ogni tabella ha la propria **RLS**.

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
2. SQL Editor → esegui **in ordine**: `schema.sql`, `schema_v2_achievements.sql`, `schema_v3_entities.sql`, `schema_v4_lists_diary.sql`.
3. Project Settings → API → copia **Project URL** e **Legacy anon key**.
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
8. ✅ Cerca & Esplora (hub: titoli/anime/cartoni/persone/studi/saghe)
9. ✅ Ricerca bilingue + titoli in lingua originale
10. ✅ Dove guardarlo (streaming IT) + trailer
11. ✅ Profilo di gusto (statistiche personali)
12. ✅ Liste personali tematiche
13. ✅ Diario di visione (date, voti, rivisioni)
14. ✅ Preferiti per persone e studi
15. ✅ Ordine di visione delle saghe (uscita + storia via AI)
16. ✅ Ricerca "Canzone → film" (via AI)
17. ✅ Stagioni ed episodi per serie/anime

### Idee in coda (da valutare)
- ✅ ~~Stagioni/episodi in ordine~~ → fatto
- ⏳ **Tracking episodi** — segna i singoli episodi come visti
- ⏳ **Preferenze utente** (`user_preferences`) e filtri avanzati (anno, lingua, paese)
- ⏳ **Suggerimenti AI automatici** con caching
- ⏳ **Lazy-loading delle rotte** per alleggerire il bundle
- ⏳ **Onboarding** + **command palette (Cmd+K)**

---

_Generato durante lo sviluppo di CineVault. Dati forniti da [TMDB](https://www.themoviedb.org)._
