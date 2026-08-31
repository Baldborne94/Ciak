import { useEffect, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useIdentityCtx } from '../lib/identityCtx'

// Primary links shown inline. Anime/Cartoni now live inside "Cerca".
const primary = [
  { to: '/', label: 'Sala', end: true },
  { to: '/search', label: 'Cerca' },
]

// Personal lists grouped under a dropdown. "Visti" e "Diario" ora sono una sola
// voce: il diario è il registro unico di tutto ciò che hai guardato.
const lists = [
  { to: '/lists/watchlist', label: 'Da vedere' },
  { to: '/lists/in-progress', label: 'In corso' },
  { to: '/lists/abandoned', label: 'Abbandonati' },
  { to: '/diario', label: 'Visti & Diario' },
  { to: '/favorites', label: 'Preferiti' },
  { to: '/liste', label: 'Liste personali' },
]

// "Profilo" non è qui: sul desktop si apre cliccando l'avatar/nome in alto a
// destra. Resta però nel menu compatto mobile (sotto), dove l'avatar è nascosto.
const trailing = [
  { to: '/ai', label: '✨ AI' },
  { to: '/in-arrivo', label: 'In arrivo' },
  { to: '/statistiche', label: '📊 Statistiche' },
  { to: '/guida', label: '❓ Guida' },
]

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition ${
    isActive ? 'bg-theatre-800 text-projector' : 'text-zinc-400 hover:text-zinc-100'
  }`

export default function Navbar() {
  const { user, signOut } = useAuth()
  const { nickname, avatarUrl } = useIdentityCtx()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [listsOpen, setListsOpen] = useState(false)
  const [menuAperto, setMenuAperto] = useState(false)

  // Il menu si chiude da solo quando cambi pagina: lasciarlo aperto sopra la
  // schermata appena scelta è il modo più veloce per farlo sembrare rotto.
  useEffect(() => setMenuAperto(false), [pathname])

  useEffect(() => {
    if (!menuAperto) return
    const suTasto = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuAperto(false)
    }
    document.addEventListener('keydown', suTasto)
    return () => document.removeEventListener('keydown', suTasto)
  }, [menuAperto])

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
            Ciak
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
              onKeyDown={(e) => e.key === 'Escape' && setListsOpen(false)}
              aria-haspopup="true"
              aria-expanded={listsOpen}
              className="flex items-center gap-1 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-zinc-400 transition hover:text-zinc-100"
            >
              Le mie liste
              <span className="text-xs" aria-hidden="true">▾</span>
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
              <NavLink
                to="/settings"
                title="Impostazioni"
                aria-label="Impostazioni"
                className={({ isActive }) =>
                  `rounded-lg px-2 py-2 text-lg transition ${
                    isActive ? 'text-projector' : 'text-zinc-400 hover:text-zinc-100'
                  }`
                }
              >
                ⚙️
              </NavLink>
              {nickname && avatarUrl ? (
                <NavLink
                  to="/profilo"
                  title={user.email ?? undefined}
                  aria-label="Vai al profilo"
                  className="hidden items-center gap-2 rounded-lg px-1 transition hover:bg-theatre-800/60 sm:flex"
                >
                  <img
                    src={avatarUrl}
                    alt=""
                    className="h-7 w-7 rounded-full border border-projector/40 bg-theatre-800"
                  />
                  <span className="max-w-[10rem] truncate text-sm text-zinc-300">{nickname}</span>
                </NavLink>
              ) : (
                <span
                  className="hidden max-w-[12rem] truncate text-sm text-zinc-400 sm:inline"
                  title={user.email ?? undefined}
                >
                  {user.email}
                </span>
              )}
              <button onClick={onSignOut} className="btn-ghost px-3 py-2">
                Esci
              </button>
            </>
          ) : (
            <NavLink to="/login" className="btn-primary px-3 py-2">
              🎟️ Accedi
            </NavLink>
          )}

          {/* Il pulsante che apre il menu, solo sotto lg. */}
          <button
            type="button"
            onClick={() => setMenuAperto((a) => !a)}
            aria-expanded={menuAperto}
            aria-controls="menu-mobile"
            className="btn-ghost px-3 py-2 lg:hidden"
          >
            <span aria-hidden="true">{menuAperto ? '✕' : '☰'}</span>{' '}
            <span className="text-sm">Menu</span>
          </button>
        </div>
      </nav>

      {/* Menu per telefono e tablet.
          Prima era una striscia che scorreva in orizzontale con dentro tredici
          voci: su uno schermo da 390px se ne vedevano quattro, l'ultima
          tagliata a metà, e Statistiche, Guida e AI restavano oltre il bordo
          senza alcun segnale che ci fosse altro. Un menu che si apre le mostra
          tutte, raggruppate, e non nasconde niente. */}
      {menuAperto && (
        <div id="menu-mobile" className="border-t border-theatre-800/80 lg:hidden">
          <nav aria-label="Menu principale" className="container-cine space-y-5 py-4">
            {[
              { titolo: 'Sfoglia', voci: [...primary, ...trailing] },
              {
                titolo: 'Il tuo archivio',
                voci: [...lists, { to: '/profilo', label: 'Profilo' }],
              },
            ].map((gruppo) => (
              <div key={gruppo.titolo}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  {gruppo.titolo}
                </p>
                <ul className="grid grid-cols-2 gap-1">
                  {gruppo.voci.map((link) => (
                    <li key={link.to}>
                      <NavLink
                        to={link.to}
                        end={link.to === '/'}
                        className={({ isActive }) =>
                          // py-3: un bersaglio che si prende col pollice senza
                          // mirare, non una riga di testo da centrare.
                          `block rounded-lg px-3 py-3 text-sm transition ${
                            isActive
                              ? 'bg-theatre-800 text-projector'
                              : 'text-zinc-300 hover:bg-theatre-800/60'
                          }`
                        }
                      >
                        {link.label}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>
      )}
    </header>
  )
}
