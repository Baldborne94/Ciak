import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tmdbHandler from './api/tmdb'

// In produzione /api/tmdb è una funzione serverless di Vercel; il dev server di
// Vite non le esegue. Senza questo ponte `npm run dev` avrebbe il catalogo
// muto, e l'unico modo di lavorare sarebbe `vercel dev`. Monta lo stesso
// handler del deploy, così ciò che si prova in locale è ciò che va online.
function tmdbDev(env: Record<string, string>): Plugin {
  return {
    name: 'ciak-tmdb-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/tmdb', async (req, res) => {
        // La chiave arriva da .env come in produzione: process.env dentro Vite
        // non vede le variabili senza prefisso VITE_, quindi gliela passiamo.
        process.env.TMDB_API_KEY ??= env.TMDB_API_KEY
        const url = new URL(req.url ?? '/', 'http://localhost')
        const query = Object.fromEntries(url.searchParams)
        await tmdbHandler(
          { method: req.method, query, headers: req.headers as Record<string, string> },
          {
            status(code) {
              res.statusCode = code
              return this
            },
            setHeader(nome, valore) {
              res.setHeader(nome, valore)
            },
            json(body) {
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify(body))
            },
          },
        )
      })
    },
  }
}

// L'identità di questa build: il commit su Vercel, altrimenti l'ora del build.
// Finisce nel codice (VITE_VERSIONE_APP) e in /versione.json: l'app aperta
// rilegge il file e, se non è più la sua, propone di aggiornare. Senza, una
// scheda aperta da ieri continuava a usare il codice vecchio, e le correzioni
// appena pubblicate «non funzionavano».
function versioneApp(): Plugin {
  const versione = (process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 12) || new Date().toISOString()
  return {
    name: 'ciak-versione',
    config(_, { command }) {
      return { define: { 'import.meta.env.VITE_VERSIONE_APP': JSON.stringify(command === 'build' ? versione : 'dev') } }
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'versione.json', source: JSON.stringify({ versione }) })
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), tmdbDev(loadEnv(mode, process.cwd(), '')), versioneApp()],
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        // Le librerie stanno in chunk propri, separati dal codice dell'app.
        // Prima viaggiavano insieme: bastava correggere una riga perché il
        // browser riscaricasse anche React e Supabase, che non erano cambiati.
        // Divisi, una nuova versione dell'app fa riscaricare solo l'app.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
}))
