import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'

// Primary links shown inline. Anime/Cartoni now live inside "Cerca".
const primary = [
  { to: '/', label: 'Sala', end: true },
  { to: '/search', label: 'Cerca' },
]

// Personal lists grouped under a dropdown.
const lists = [
  { to: '/lists/watchlist', label: 'Da vedere' },
  { to: '/lists/in-progress', label: 'In corso' },
  { to: '/lists/watched', label: 'Visti' },
  { to: '/favorites', label: 'Preferiti' },
  { to: '/liste', label: 'Liste personali' },
]

const trailing = [
  { to: '/recommendations', label: 'Per te' },
  { to: '/profilo', label: 'Profilo' },
  { to: '/trophies', label: 'Trofei' },
]

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition ${
    isActive ? 'bg-theatre-800 text-projector' : 'text-zinc-400 hover:text-zinc-100'
  }`

export default function Navbar() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [listsOpen, setListsOpen] = useState(false)

  async function onSignOut() {
    await signOut()
    navigate('/')
  }

  return (
    <header className="sticky top-0 z-30 border-b border-theatre-800/80 bg-theatre-950/80 backdrop-blur">
      <nav className="container-cine flex h-16 items-center justify-between gap-4">
        <NavLink to="/" className="group flex shrink-0 items-center gap-2">
          <span className="text-2xl transition-transform group-hover:rotate-12">🎬</span>
          <span className="font-display text-2xl tracking-wide text-projector">
            Cine<span className="text-curtain-light">Vault</span>
          </span>
        </NavLink>

        <ul className="hidden items-center gap-1 lg:flex">
          {primary.map((link) => (
            <li key={link.to}>
              <NavLink to={link.to} end={link.end} className={linkClass}>
                {link.label}
              </NavLink>
            </li>
          ))}

          {/* Le mie liste — dropdown */}
          <li
            className="relative"
            onMouseEnter={() => setListsOpen(true)}
            onMouseLeave={() => setListsOpen(false)}
          >
            <button
              onClick={() => setListsOpen((o) => !o)}
              className="flex items-center gap-1 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-zinc-400 transition hover:text-zinc-100"
            >
              Le mie liste
              <span className="text-xs">▾</span>
            </button>
            {listsOpen && (
              <ul className="absolute left-0 top-full z-40 w-44 overflow-hidden rounded-lg border border-theatre-800 bg-theatre-900 py-1 shadow-reel">
                {lists.map((link) => (
                  <li key={link.to}>
                    <NavLink
                      to={link.to}
                      onClick={() => setListsOpen(false)}
                      className={({ isActive }) =>
                        `block px-4 py-2 text-sm transition ${
                          isActive
                            ? 'bg-theatre-800 text-projector'
                            : 'text-zinc-300 hover:bg-theatre-800 hover:text-zinc-100'
                        }`
                      }
                    >
                      {link.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            )}
          </li>

          {trailing.map((link) => (
            <li key={link.to}>
              <NavLink to={link.to} className={linkClass}>
                {link.label}
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="flex shrink-0 items-center gap-2">
          {user ? (
            <>
              <span
                className="hidden max-w-[12rem] truncate text-sm text-zinc-400 sm:inline"
                title={user.email ?? undefined}
              >
                {user.email}
              </span>
              <button onClick={onSignOut} className="btn-ghost px-3 py-2">
                Esci
              </button>
            </>
          ) : (
            <NavLink to="/login" className="btn-primary px-3 py-2">
              🎟️ Accedi
            </NavLink>
          )}
        </div>
      </nav>

      {/* Compact nav for small/medium screens — flat, horizontal scroll */}
      <ul className="container-cine flex items-center gap-1 overflow-x-auto pb-2 lg:hidden">
        {[...primary, ...lists, ...trailing].map((link) => (
          <li key={link.to}>
            <NavLink
              to={link.to}
              end={link.to === '/'}
              className={({ isActive }) =>
                `whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition ${
                  isActive ? 'bg-theatre-800 text-projector' : 'text-zinc-400'
                }`
              }
            >
              {link.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </header>
  )
}
