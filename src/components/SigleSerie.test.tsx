import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import SigleSerie from './SigleSerie'
import { PUNTI_VUOTI, type PuntiSigla } from '../lib/sigle'

function monta(punti: PuntiSigla = PUNTI_VUOTI, { fine = false, conEsatteInizio = false, conEsatteFine = false } = {}) {
  const onReimpara = vi.fn()
  const onScelte = vi.fn()
  render(
    <SigleSerie
      punti={punti}
      onReimpara={onReimpara}
      scelte={{ inizio: false, fine }}
      onScelte={onScelte}
      esatte={null}
      conEsatteInizio={conEsatteInizio}
      conEsatteFine={conEsatteFine}
    />,
  )
  return { onReimpara, onScelte }
}

describe('SigleSerie', () => {
  it('senza tempi spiega come si imparano, senza chiedere di scriverli', () => {
    monta()
    expect(screen.getByText(/La prima volta premi «⏭ Salta sigla»/)).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('mostra i tempi imparati e li fa reimparare', () => {
    const { onReimpara } = monta({ inizio: 95, fine: 185, coda: 120 })
    expect(screen.getByText(/parte a 1:35 e finisce a 3:05, la finale negli ultimi 2:00/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reimpara' }))
    expect(onReimpara).toHaveBeenCalledTimes(1)
  })

  it('una fine prima dell inizio non si mostra', () => {
    monta({ inizio: 95, fine: 30, coda: null })
    expect(screen.getByText(/parte a 1:35\./)).toBeInTheDocument()
  })

  it('coi tempi esatti di TheIntroDB quelli della serie non si mostrano', () => {
    monta({ inizio: 95, fine: 185, coda: 120 }, { conEsatteInizio: true, conEsatteFine: true })
    expect(screen.queryByText(/In questa serie/)).not.toBeInTheDocument()
    expect(screen.queryByText(/La prima volta premi/)).not.toBeInTheDocument()
  })

  it('alla sigla finale: passare subito o guardarla fino alla fine', () => {
    const { onScelte } = monta()
    expect(screen.getByLabelText('guardala fino alla fine, poi passa al prossimo')).toBeChecked()
    fireEvent.click(screen.getByLabelText('passa subito al prossimo episodio'))
    expect(onScelte).toHaveBeenLastCalledWith({ fine: true })
    fireEvent.click(screen.getByLabelText('Salta sempre la sigla iniziale'))
    expect(onScelte).toHaveBeenLastCalledWith({ inizio: true })
  })
})
