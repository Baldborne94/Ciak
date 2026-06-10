import { NavLink, useNavigate } from 'react-router-dom'
import { useState } from 'react'

const NAV_LINKS = [
  { to: '/', label: 'Sala', exact: true },
  { to: '/search', label: 'Cerca' },
  { to: '/lists/watched', label: 'Visti' },
  { to: '/lists/watchlist', label: 'Da vedere' },
  { to: '/lists/in-progress', label: 'In corso' },
  { to: '/favorites', label: 'Preferiti' },
  { to: '/recommendations', label: 'AI' },
]

export default function Navbar() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')

  function onSearch(e: React.FormEvent) {
    e.preventDefault()
    const q = query.trim()
    if (q) navigate(`/search?q=${encodeURIComponent(q)}`)
  }

  return (
    <header className="sticky top-0 z-40 border-b border-cinema-border bg-cinema-black/85 backdrop-blur-md">
      <div className="film-strip h-1 w-full opacity-60" />
      <nav className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
        {/* Logo */}
        <NavLink to="/" className="flex shrink-0 items-center gap-2">
          <span className="text-2xl" aria-hidden>🎬</span>
          <span className="title-display text-2xl leading-none text-gold">
            Cine<span className="text-white">Vault</span>
          </span>
        </NavLink>

        {/* Link principali */}
        <div className="hidden flex-1 items-center gap-1 lg:flex">
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.exact}
              className={({ isActive }) =>
                `rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  isActive
                    ? 'bg-gold/15 text-gold'
                    : 'text-zinc-400 hover:text-gold'
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </div>

        {/* Ricerca rapida */}
        <form onSubmit={onSearch} className="ml-auto flex items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cerca un titolo…"
            className="w-36 rounded-lg border border-cinema-border bg-cinema-panel/60 px-3 py-1.5
              text-sm text-zinc-200 placeholder:text-zinc-500 focus:border-gold/60
              focus:outline-none focus:ring-1 focus:ring-gold/40 sm:w-52"
          />
          <NavLink
            to="/settings"
            className="rounded-md p-2 text-zinc-400 transition hover:text-gold"
            title="Impostazioni"
            aria-label="Impostazioni"
          >
            ⚙️
          </NavLink>
        </form>
      </nav>
    </header>
  )
}
