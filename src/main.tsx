import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import { AuthProvider } from './lib/auth.tsx'
import { AchievementsProvider } from './lib/achievementsContext.tsx'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AchievementsProvider>
          <App />
        </AchievementsProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)

// Register the PWA service worker (production only — avoids dev caching issues).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* registration is best-effort */
    })
  })
}
