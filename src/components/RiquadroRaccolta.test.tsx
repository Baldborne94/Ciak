import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RiquadroRaccolta from './RiquadroRaccolta'

describe('RiquadroRaccolta', () => {
  it('con la copertina scelta: l’immagine larga, il nome e quanti titoli', async () => {
    const onApri = vi.fn()
    render(<RiquadroRaccolta nome="Studio Ghibli" copertina="https://img/ghibli.jpg" mosaico={[]} quanti={4} visti={1} aperta={false} onApri={onApri} />)
    const riquadro = screen.getByRole('button', { name: /Studio Ghibli/ })
    expect(riquadro).toHaveAttribute('aria-expanded', 'false')
    expect(riquadro).toHaveTextContent('4 titoli · 1 visto')
    expect(riquadro.querySelector('img')).toHaveAttribute('src', 'https://img/ghibli.jpg')
    await userEvent.click(riquadro)
    expect(onApri).toHaveBeenCalled()
  })

  it('senza copertina: il mosaico delle locandine dei primi titoli', () => {
    render(
      <RiquadroRaccolta nome="Natale" copertina={null} mosaico={['/a.jpg', '/b.jpg', '/c.jpg', '/d.jpg', '/e.jpg']} quanti={1} visti={0} aperta onApri={() => {}} />,
    )
    const riquadro = screen.getByRole('button', { name: /Natale/ })
    expect(riquadro).toHaveAttribute('aria-expanded', 'true')
    expect(riquadro).toHaveTextContent('1 titolo')
    expect([...riquadro.querySelectorAll('img')].map((i) => i.getAttribute('src'))).toEqual(['/a.jpg', '/b.jpg', '/c.jpg', '/d.jpg'])
  })
})
