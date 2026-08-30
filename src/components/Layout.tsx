import { Suspense } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Navbar from './Navbar'
import ScrollManager from './ScrollManager'
import ToastHost from './ToastHost'
import InstallPrompt from './InstallPrompt'
import ReleaseAlerts from './ReleaseAlerts'
import ErrorBoundary from './ErrorBoundary'
import { Loader } from './States'

export default function Layout() {
  // La key sul path fa rimontare il boundary cambiando pagina: così un errore
  // su una rotta non "blocca" anche quelle a cui navighi dopo.
  const { pathname } = useLocation()
  return (
    <div className="flex min-h-screen flex-col">
      <ScrollManager />
      <Navbar />
      <main className="container-cine flex-1 py-8">
        <ErrorBoundary key={pathname}>
          <Suspense fallback={<Loader label="Carico…" />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>
      <ToastHost />
      <InstallPrompt />
      <ReleaseAlerts />
      <footer className="border-t border-theatre-800/80 py-6">
        <div className="container-cine flex flex-col items-center justify-between gap-2 text-sm text-zinc-500 sm:flex-row">
          <p>
            🎬 <span className="font-display tracking-wide">Ciak</span> — il
            tuo archivio personale di cinema.
          </p>
          <p>
            Dati forniti da{' '}
            <a
              href="https://www.themoviedb.org"
              target="_blank"
              rel="noreferrer"
              className="text-projector/80 hover:text-projector"
            >
              TMDB
            </a>
          </p>
        </div>
      </footer>
    </div>
  )
}
