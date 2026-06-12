import { Suspense } from 'react'
import { Outlet } from 'react-router-dom'
import Navbar from './Navbar'
import AchievementToast from './AchievementToast'
import InstallPrompt from './InstallPrompt'
import ReleaseAlerts from './ReleaseAlerts'
import { Loader } from './States'

export default function Layout() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="container-cine flex-1 py-8">
        <Suspense fallback={<Loader label="Carico…" />}>
          <Outlet />
        </Suspense>
      </main>
      <AchievementToast />
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
