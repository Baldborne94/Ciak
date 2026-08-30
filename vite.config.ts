import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
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
})
