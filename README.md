# 🎬 CineVault

> Il tuo **caveau personale** di film, serie TV, anime e cartoni.
> Cataloga, vota, prendi appunti e ricevi suggerimenti AI su misura — il tutto in pieno stile sala cinema.

Applicazione web personale per appassionati di cinema. Esplora un catalogo completo e sempre
aggiornato (TMDB), gestisci le tue liste personalizzate e ricevi raccomandazioni intelligenti
basate sui tuoi gusti (Anthropic).

---

## 🧰 Stack

| Layer | Tecnologia |
|---|---|
| Frontend | React + Vite + TypeScript |
| Styling | Tailwind CSS (tema cinematografico) |
| Database personale | Supabase (Postgres + Auth + RLS) |
| Catalogo cinema | TMDB API |
| Raccomandazioni AI | Anthropic API (via serverless function) |
| Deploy | Vercel |

---

## 🚀 Avvio rapido

```bash
# 1. Installa le dipendenze
npm install

# 2. Configura le variabili d'ambiente
cp .env.example .env
#    → compila VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_TMDB_ACCESS_TOKEN

# 3. Avvia in sviluppo
npm run dev
```

### 🔑 Chiavi necessarie

- **TMDB** — registrati su [themoviedb.org](https://www.themoviedb.org), poi
  *Settings → API* e copia il **API Read Access Token** (v4) in `VITE_TMDB_ACCESS_TOKEN`.
- **Supabase** — dal dashboard del progetto: *Project Settings → API* →
  `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
- **Anthropic** — chiave server-side (`ANTHROPIC_API_KEY`, **senza** prefisso `VITE_`).
  Usata solo dalla serverless function in `/api`. Su Vercel va aggiunta tra le *Environment Variables*.

### 🗄️ Database

Apri il **SQL Editor** su Supabase e incolla il contenuto di
[`supabase/schema.sql`](./supabase/schema.sql). Crea le tabelle `user_titles` e
`user_preferences` con i trigger di `updated_at` e le policy di Row Level Security.

---

## 📂 Struttura

```
api/                      Serverless functions (Vercel) — raccomandazioni AI
public/                   Asset statici (favicon ciak)
src/
  components/             UI riutilizzabile (Navbar, TitleCard, Spinner…)
  lib/                    Client esterni (supabase.ts, tmdb.ts)
  pages/                  Una pagina per rotta
    lists/               Visti / Da vedere / In corso
  types/                 Tipi di dominio condivisi
supabase/schema.sql       Schema DB + RLS
```

### 🧭 Rotte

| Path | Pagina |
|---|---|
| `/` | Dashboard (trending + statistiche) |
| `/search` | Ricerca con filtri |
| `/title/:type/:id` | Scheda dettaglio titolo |
| `/lists/watched` · `/lists/watchlist` · `/lists/in-progress` | Liste personali |
| `/favorites` | Preferiti con voti e note |
| `/recommendations` | Suggerimenti AI |
| `/settings` | Preferenze utente |

---

## 🗺️ Roadmap

- [x] **Fase 1** — Setup (React + Vite + TS + Tailwind + Supabase/TMDB client + schema DB)
- [x] Ricerca e scheda dettaglio titolo (dati TMDB live)
- [ ] **Fase 3** — Sistema liste (visto / da vedere / in corso) su Supabase + Auth
- [ ] **Fase 4** — Preferiti con voto e note
- [ ] **Fase 5** — Dashboard con statistiche reali
- [ ] **Fase 6** — Raccomandazioni AI (Anthropic) on-demand
- [ ] **Fase 7** — Preferenze utente e filtri avanzati (genere, anno, paese, rating)

---

🍿 *Dati dei titoli forniti da [TMDB](https://www.themoviedb.org). Questo prodotto usa l'API
TMDB ma non è approvato o certificato da TMDB.*
