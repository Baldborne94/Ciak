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

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), tmdbDev(loadEnv(mode, process.cwd(), ''))],
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
