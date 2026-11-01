import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PremiVinti from './PremiVinti'

vi.mock('../lib/logFailure', () => ({ logFailure: () => vi.fn() }))

// Wikidata finto: le righe SPARQL di un titolo.
function rispondi(bindings: unknown[]) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ results: { bindings } })))
}
const premio = (qid: string, nome: string, anno: number, chi?: string) => ({
  premio: { value: `http://www.wikidata.org/entity/${qid}` },
  premioLabel: { value: nome },
  anno: { value: String(anno) },
  ...(chi ? { chiLabel: { value: chi } } : {}),
})

afterEach(() => vi.restoreAllMocks())

describe('PremiVinti', () => {
  it('mostra i premi con l anno e chi li ha vinti, il miglior film per primo', async () => {
    const f = rispondi([premio('Q901', 'Oscar al miglior attore non protagonista', 2024, 'Robert Downey Jr.'), premio('Q102427', 'Oscar al miglior film', 2024)])
    render(<PremiVinti type="movie" id={872585} />)
    expect(await screen.findByRole('heading', { name: /Premi vinti \(2\)/ })).toBeInTheDocument()
    const voci = screen.getAllByRole('listitem')
    expect(voci[0]).toHaveTextContent('Oscar al miglior film')
    expect(voci[1]).toHaveTextContent('Robert Downey Jr.')
    expect(decodeURIComponent(String(f.mock.calls[0][0]))).toContain('wdt:P4947 "872585"')
  })

  it('i premi minori oltre gli otto si aprono a richiesta', async () => {
    rispondi(Array.from({ length: 10 }, (_, i) => premio(`Q${500 + i}`, `Premio della critica ${i}`, 2000 + i)))
    render(<PremiVinti type="movie" id={1} />)
    await screen.findByRole('heading', { name: /Premi vinti \(10\)/ })
    expect(screen.getAllByRole('listitem')).toHaveLength(8)
    await userEvent.click(screen.getByRole('button', { name: 'Mostra tutti i premi (10)' }))
    expect(screen.getAllByRole('listitem')).toHaveLength(10)
  })

  it('senza premi, o se Wikidata non risponde, la sezione non c è', async () => {
    const f = rispondi([])
    const { unmount } = render(<PremiVinti type="tv" id={2} />)
    await vi.waitFor(() => expect(f).toHaveBeenCalled())
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
    unmount()
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('rete'))
    render(<PremiVinti type="tv" id={3} />)
    await new Promise((r) => setTimeout(r, 10))
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })
})
