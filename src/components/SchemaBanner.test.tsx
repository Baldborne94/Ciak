import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import SchemaBanner from './SchemaBanner'
import { leggiSchema, SCHEMA_RICHIESTO } from '../lib/schemaVersion'
import { useAuth } from '../lib/auth'

vi.mock('../lib/schemaVersion', async () => {
  const vero = await vi.importActual<typeof import('../lib/schemaVersion')>('../lib/schemaVersion')
  // `messaggioSchema` resta quello vero: il testo mostrato è metà del valore
  // dell'avviso, e un messaggio finto non direbbe niente.
  return { ...vero, leggiSchema: vi.fn() }
})
vi.mock('../lib/auth', () => ({ useAuth: vi.fn() }))

const leggi = vi.mocked(leggiSchema)
const auth = vi.mocked(useAuth)

function loggato(dentro: boolean) {
  auth.mockReturnValue({ user: dentro ? { id: 'u1' } : null } as ReturnType<typeof useAuth>)
}

beforeEach(() => {
  vi.clearAllMocks()
  loggato(true)
})

describe('SchemaBanner', () => {
  it('non dice niente quando il database è allineato', async () => {
    leggi.mockResolvedValue({ stato: 'ok', versione: 16 })
    render(<SchemaBanner />)
    await waitFor(() => expect(leggi).toHaveBeenCalled())
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('avvisa quando il database è indietro, dicendo cosa fare', async () => {
    leggi.mockResolvedValue({ stato: 'vecchio', versione: 14 })
    render(<SchemaBanner />)

    const banda = await screen.findByRole('status')
    expect(banda).toHaveTextContent('v14')
    // Non il numero scritto a mano: così il test non va aggiornato a ogni
    // schema nuovo, e continua a verificare ciò che gli interessa — che la
    // banda dica quale versione serve.
    expect(banda).toHaveTextContent(`v${SCHEMA_RICHIESTO}`)
    // Un avviso che non dice come rimediare è solo un allarme.
    expect(banda).toHaveTextContent('supabase/')
  })

  it('ammette di non sapere la versione quando il registro non c è', async () => {
    leggi.mockResolvedValue({ stato: 'assente' })
    render(<SchemaBanner />)
    expect(await screen.findByRole('status')).toHaveTextContent('sconosciuta')
  })

  it('tace quando la lettura non si pronuncia', async () => {
    // `null` è la risposta di leggiSchema davanti a un errore che non sa
    // interpretare (rete giù, 500). Trasformarlo in un avviso manderebbe
    // l'utente a eseguire SQL che non gli servono.
    leggi.mockResolvedValue(null)
    render(<SchemaBanner />)
    await waitFor(() => expect(leggi).toHaveBeenCalled())
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('a chi non ha fatto l accesso non chiede nemmeno la versione', async () => {
    // Un visitatore di una lista pubblica non ha niente da farsene, e la
    // richiesta sarebbe sprecata.
    loggato(false)
    leggi.mockResolvedValue({ stato: 'vecchio', versione: 14 })
    render(<SchemaBanner />)

    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
    expect(leggi).not.toHaveBeenCalled()
  })
})
