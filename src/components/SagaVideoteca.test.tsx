import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SagaVideoteca from './SagaVideoteca'

function saga(props: Partial<Parameters<typeof SagaVideoteca>[0]> = {}) {
  return render(
    <SagaVideoteca nome="Alien" poster="/alien.jpg" quanti={3} visti={1} anni="1979–1992" {...props}>
      <li>Alien</li>
      <li>Aliens</li>
      <li>Alien³</li>
    </SagaVideoteca>,
  )
}

describe('SagaVideoteca', () => {
  it('chiusa dice cosa contiene, senza mostrare i film', () => {
    saga()
    const riga = screen.getByRole('button', { name: /Alien/ })
    expect(riga).toHaveAttribute('aria-expanded', 'false')
    expect(riga).toHaveTextContent('Saga · 3 film · 1979–1992 · 1 visti')
    expect(screen.queryByRole('list', { name: 'Film di Alien' })).not.toBeInTheDocument()
  })

  it('si apre e si richiude', async () => {
    saga()
    const riga = screen.getByRole('button', { name: /Alien/ })
    await userEvent.click(riga)
    expect(screen.getByRole('list', { name: 'Film di Alien' }).querySelectorAll('li')).toHaveLength(3)
    await userEvent.click(riga)
    expect(screen.queryByRole('list', { name: 'Film di Alien' })).not.toBeInTheDocument()
  })

  it('cercando resta aperta: il film trovato si vede subito', () => {
    saga({ apertaSempre: true })
    expect(screen.getByRole('list', { name: 'Film di Alien' })).toBeInTheDocument()
  })

  it('tutti visti lo dice così', () => {
    saga({ visti: 3 })
    expect(screen.getByRole('button', { name: /Alien/ })).toHaveTextContent('tutti visti')
  })
})
