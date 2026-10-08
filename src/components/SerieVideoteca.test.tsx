import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SerieVideoteca from './SerieVideoteca'
import type { EpisodioVideoteca } from '../lib/videoteca'
import { stagioniSerie } from '../lib/stagioniTmdb'

// TMDB non si interroga nei test: le stagioni arrivano da qui.
vi.mock('../lib/stagioniTmdb', async (originale) => ({
  ...(await originale<typeof import('../lib/stagioniTmdb')>()),
  stagioniSerie: vi.fn(),
}))

function ep(stagione: number, episodio: number, over: Partial<EpisodioVideoteca> = {}): EpisodioVideoteca {
  return {
    id: `s${stagione}e${episodio}`,
    nome: `South Park S0${stagione}E${String(episodio).padStart(2, '0')}`,
    file: `South Park S0${stagione}E${String(episodio).padStart(2, '0')}.mp4`,
    stagione,
    episodio,
    visto: false,
    posizione: 0,
    secondiVisti: 0,
    durata: 1320,
    guardato: null,
    ...over,
  }
}

const EPISODI = [
  ep(1, 2, { visto: true, guardato: '2026-10-01T20:00:00Z' }),
  ep(1, 7),
  ep(12, 1),
]

function monta(episodi = EPISODI, onApri = vi.fn()) {
  render(<SerieVideoteca titolo="South Park" poster={null} anno="1997" episodi={episodi} scaricati={new Set()} onApri={onApri} />)
  return onApri
}

describe('SerieVideoteca', () => {
  it('chiusa è una riga sola: episodi, stagioni, visti e il prossimo da guardare', () => {
    monta()
    expect(screen.getByText('1997 · 3 episodi in 2 stagioni · 1 visti')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '▶ Continua S1E7' })).toBeInTheDocument()
    // Gli episodi non si vedono finché non la si apre.
    expect(screen.queryByRole('list', { name: 'Stagione 1' })).not.toBeInTheDocument()
  })

  it('aperta divide gli episodi per stagione, in ordine', async () => {
    monta()
    await userEvent.click(screen.getByRole('button', { name: /South Park/, expanded: false }))

    const s1 = screen.getByRole('list', { name: 'Stagione 1' })
    expect(within(s1).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Ep. 2✓ South Park S01E02▶',
      'Ep. 7South Park S01E07▶',
    ])
    expect(screen.getByText('Stagione 12')).toBeInTheDocument()
    expect(screen.getByText('1/2 visti')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /South Park/, expanded: true }))
    expect(screen.queryByRole('list', { name: 'Stagione 1' })).not.toBeInTheDocument()
  })

  it('«Continua» e il clic su un episodio aprono quell episodio', async () => {
    const onApri = monta()
    await userEvent.click(screen.getByRole('button', { name: '▶ Continua S1E7' }))
    expect(onApri).toHaveBeenLastCalledWith(expect.objectContaining({ id: 's1e7' }))

    await userEvent.click(screen.getByRole('button', { name: /South Park/, expanded: false }))
    await userEvent.click(within(screen.getByRole('list', { name: 'Stagione 12' })).getByRole('button'))
    expect(onApri).toHaveBeenLastCalledWith(expect.objectContaining({ id: 's12e1' }))
  })

  it('aperta si può scegliere il titolo di tutta la serie', async () => {
    const onScegliTitolo = vi.fn()
    const { rerender } = render(
      <SerieVideoteca titolo="A Mickey Mouse Cartoon" poster={null} anno={null} episodi={EPISODI} scaricati={new Set()} onApri={vi.fn()} onScegliTitolo={onScegliTitolo} />,
    )
    // Chiusa resta una riga pulita.
    expect(screen.queryByRole('button', { name: /Scegli il titolo/ })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /A Mickey Mouse Cartoon/, expanded: false }))
    await userEvent.click(screen.getByRole('button', { name: '✎ Scegli il titolo della serie' }))
    expect(onScegliTitolo).toHaveBeenCalledTimes(1)

    // Riconosciuta, la domanda è se è quella giusta.
    rerender(
      <SerieVideoteca titolo="Topolino" poster={null} anno={null} episodi={EPISODI} scaricati={new Set()} onApri={vi.fn()} onScegliTitolo={onScegliTitolo} riconosciuta />,
    )
    expect(screen.getByRole('button', { name: '✎ Non è questa serie? Scegli il titolo' })).toBeInTheDocument()
  })

  it('gli speciali (stagione 0) stanno in fondo, sotto «Speciali»', async () => {
    monta([ep(0, 1, { nome: 'OADE01' }), ep(1, 1)])
    await userEvent.click(screen.getByRole('button', { name: /South Park/, expanded: false }))
    const titoli = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(titoli[0]).toMatch(/^Stagione 1/)
    expect(titoli[1]).toMatch(/^Speciali/)
    expect(within(screen.getByRole('list', { name: 'Speciali' })).getByText('OADE01')).toBeInTheDocument()
  })

  it('un episodio lasciato a metà si riprende', () => {
    monta([ep(1, 2), ep(1, 3, { posizione: 600, secondiVisti: 600, guardato: '2026-10-01T20:00:00Z' })])
    expect(screen.getByRole('button', { name: '▶ Riprendi S1E3' })).toBeInTheDocument()
  })

  it('mai iniziata si comincia dal primo episodio', () => {
    monta([ep(2, 1), ep(1, 1)])
    expect(screen.getByRole('button', { name: '▶ Inizia S1E1' })).toBeInTheDocument()
  })

  it('tutta vista non propone niente da continuare', () => {
    monta([ep(1, 1, { visto: true })])
    expect(screen.getByText('✓ Vista')).toBeInTheDocument()
    expect(screen.getByText(/tutti visti/)).toBeInTheDocument()
  })
})

describe('SerieVideoteca, gli episodi che mancano su Drive', () => {
  it('aperta, chiede a TMDB quanti sono e mostra i buchi in grigio al loro posto', async () => {
    vi.mocked(stagioniSerie).mockResolvedValue([
      { stagione: 1, episodi: 3 },
      { stagione: 2, episodi: 4 },
    ])
    render(
      <SerieVideoteca titolo="South Park" poster={null} anno="1997" episodi={[ep(1, 1), ep(1, 3)]} scaricati={new Set()} onApri={vi.fn()} tmdbId={2190} />,
    )
    await userEvent.click(screen.getByRole('button', { name: /^South Park/ }))
    expect(stagioniSerie).toHaveBeenCalledWith(2190)
    const stagione1 = await screen.findByRole('list', { name: 'Stagione 1' })
    const righe = within(stagione1).getAllByRole('listitem')
    expect(righe.map((r) => r.textContent)).toEqual([
      expect.stringContaining('Ep. 1'),
      expect.stringMatching(/Ep\. 2.*non su Drive/),
      expect.stringContaining('Ep. 3'),
    ])
    expect(screen.getByText(/manca l'ep\. 2/)).toBeInTheDocument()
    // Una stagione intera che non c'è si dice, senza elencare i suoi episodi.
    expect(within(screen.getByRole('list', { name: 'Stagioni non su Drive' })).getByText('Stagione 2 · 4 episodi, nessuno su Drive')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Stagione 2' })).not.toBeInTheDocument()
    // Anche la riga chiusa lo dice, ora che si sa.
    expect(screen.getByText(/5 non su Drive/)).toBeInTheDocument()
  })

  it('senza id TMDB non chiede niente e non inventa buchi', async () => {
    vi.mocked(stagioniSerie).mockClear()
    monta()
    await userEvent.click(screen.getByRole('button', { name: /^South Park/ }))
    expect(stagioniSerie).not.toHaveBeenCalled()
    expect(screen.queryByText(/non su Drive/)).not.toBeInTheDocument()
  })

  it('aperta si può cancellare tutta da Drive; chiusa il pulsante non c’è, per non premerlo per sbaglio', async () => {
    const onCancella = vi.fn()
    render(
      <SerieVideoteca titolo="South Park" poster={null} anno="1997" episodi={EPISODI} scaricati={new Set()} onApri={vi.fn()} onCancella={onCancella} />,
    )
    expect(screen.queryByRole('button', { name: /Cancella la serie/ })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /South Park/, expanded: false }))
    await userEvent.click(screen.getByRole('button', { name: '🗑 Cancella la serie da Drive' }))
    expect(onCancella).toHaveBeenCalledTimes(1)
  })
})
