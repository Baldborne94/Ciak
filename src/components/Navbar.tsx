import { NavLink } from 'react-router-dom'

const links = [
  { to: '/', label: 'Sala', end: true },
  { to: '/search', label: 'Cerca' },
  { to: '/lists/watchlist', label: 'Da vedere' },
  { to: '/lists/watched', label: 'Visti' },
  { to: '/lists/in-progress', label: 'In corso' },
  { to: '/favorites', label: 'Preferiti' },
  { to: '/recommendations', label: 'Per te' },
]

export default function Navbar() {
  return (
    <header className="sticky top-0 z-30 border-b border-theatre-800/80 bg-theatre-950/80 backdrop-blur">
      <nav className="container-cine flex h-16 items-center justify-between gap-4">
        <NavLink to="/" className="group flex items-center gap-2">
          <span className="text-2xl transition-transform group-hover:rotate-12">
            🎬
          </span>
          <span className="font-display text-2xl tracking-wide text-projector">
            Cine<span className="text-curtain-light">Vault</span>
          </span>
        </NavLink>

        <ul className="hidden items-center gap-1 lg:flex">
          {links.map((link) => (
            <li key={link.to}>
              <NavLink
                to={link.to}
                end={link.end}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-2 text-sm font-medium transition ${
                    isActive
                      ? 'bg-theatre-800 text-projector'
                      : 'text-zinc-400 hover:text-zinc-100'
                  }`
                }
              >
                {link.label}
              </NavLink>
            </li>
          ))}
        </ul>

        <NavLink to="/settings" className="btn-ghost px-3 py-2">
          <span className="hidden sm:inline">Impostazioni</span>
          <span className="sm:hidden">⚙️</span>
        </NavLink>
      </nav>

      {/* Compact nav for small/medium screens */}
      <ul className="container-cine flex items-center gap-1 overflow-x-auto pb-2 lg:hidden">
        {links.map((link) => (
          <li key={link.to}>
            <NavLink
              to={link.to}
              end={link.end}
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
