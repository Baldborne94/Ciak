import { Outlet } from 'react-router-dom'
import Navbar from './Navbar'

export default function Layout() {
  return (
    <div className="flex min-h-full flex-col">
      <Navbar />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">
        <Outlet />
      </main>
      <footer className="border-t border-cinema-border py-6 text-center text-xs text-zinc-600">
        <div className="film-strip mx-auto mb-3 h-1 w-32 opacity-40" />
        CineVault · il tuo caveau cinefilo · dati da{' '}
        <a
          href="https://www.themoviedb.org"
          target="_blank"
          rel="noreferrer"
          className="text-gold/70 hover:text-gold"
        >
          TMDB
        </a>
      </footer>
    </div>
  )
}
