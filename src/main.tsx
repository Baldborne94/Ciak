import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import { AuthProvider } from './lib/auth.tsx'
import { IdentityProvider } from './lib/identityContext.tsx'
import { ToastProvider } from './lib/toastContext.tsx'
import { LibraryProvider } from './lib/libraryContext.tsx'
import { registraErrore } from './lib/errorLog'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <IdentityProvider>
            <LibraryProvider>
              <App />
            </LibraryProvider>
          </IdentityProvider>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)

// Gli errori che non passano da nessun try/catch e nessun boundary: una
// promessa rifiutata e dimenticata, un errore in un gestore di eventi. Sono
// quelli di cui non si sospetta nemmeno l'esistenza, quindi vanno registrati.
window.addEventListener('error', (e) => {
  void registraErrore('errore non catturato', e.error ?? e.message)
})
window.addEventListener('unhandledrejection', (e) => {
  void registraErrore('promessa rifiutata e non gestita', e.reason)
})

// Register the PWA service worker (production only — avoids dev caching issues).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* registration is best-effort */
    })
  })
}
