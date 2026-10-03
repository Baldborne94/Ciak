import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import SigleSerie from './SigleSerie'
import { PUNTI_VUOTI, type PuntiSigla } from '../lib/sigle'

function monta(punti: PuntiSigla = PUNTI_VUOTI, { adesso = 35.4, durataVideo = 1330 as number | null, fine = false } = {}) {
  const onCambia = vi.fn()
  const onScelte = vi.fn()
  render(
    <SigleSerie
      punti={punti}
      onCambia={onCambia}
      adesso={() => adesso}
      durataVideo={durataVideo}
      scelte={{ inizio: false, fine }}
      onScelte={onScelte}
      esatte={null}
    />,
  )
  return { onCambia, onScelte }
}

describe('SigleSerie', () => {
  it('«📍 adesso» segna il punto dove è il video', () => {
    const { onCambia } = monta()
    fireEvent.click(screen.getByRole('button', { name: 'La sigla iniziale comincia adesso' }))
    expect(onCambia).toHaveBeenLastCalledWith({ inizio: 35 })
    fireEvent.click(screen.getByRole('button', { name: 'La sigla iniziale finisce adesso' }))
    expect(onCambia).toHaveBeenLastCalledWith({ fine: 35 })
  })

  it('la sigla finale si ricorda come quanto manca alla fine', () => {
    const { onCambia } = monta(PUNTI_VUOTI, { adesso: 1299 })
    fireEvent.click(screen.getByRole('button', { name: 'La sigla finale comincia adesso' }))
    expect(onCambia).toHaveBeenLastCalledWith({ coda: 31 })
  })

  it('i tempi si vedono e si scrivono a mano', () => {
    const { onCambia } = monta({ inizio: 4, fine: 34, coda: 31 })
    expect(screen.getByLabelText('Inizio della sigla iniziale')).toHaveValue('0:04')
    expect(screen.getByLabelText('Fine della sigla iniziale')).toHaveValue('0:34')
    // La finale si mostra dall'inizio di questo episodio: 1330 - 31.
    expect(screen.getByLabelText('Inizio della sigla finale')).toHaveValue('21:39')

    const fine = screen.getByLabelText('Fine della sigla iniziale')
    fireEvent.change(fine, { target: { value: '0:40' } })
    fireEvent.blur(fine)
    expect(onCambia).toHaveBeenLastCalledWith({ fine: 40 })

    const finale = screen.getByLabelText('Inizio della sigla finale')
    fireEvent.change(finale, { target: { value: '21:00' } })
    fireEvent.keyDown(finale, { key: 'Enter' })
    fireEvent.blur(finale)
    expect(onCambia).toHaveBeenLastCalledWith({ coda: 70 })
  })

  it('un tempo che non si capisce torna com era, uno vuoto cancella il punto', () => {
    const { onCambia } = monta({ inizio: 4, fine: 34, coda: null })
    const inizio = screen.getByLabelText('Inizio della sigla iniziale')
    fireEvent.change(inizio, { target: { value: 'boh' } })
    fireEvent.blur(inizio)
    expect(inizio).toHaveValue('0:04')
    expect(onCambia).not.toHaveBeenCalled()
    fireEvent.change(inizio, { target: { value: '' } })
    fireEvent.blur(inizio)
    expect(onCambia).toHaveBeenLastCalledWith({ inizio: null })
  })

  it('una fine prima dell inizio si segnala', () => {
    monta({ inizio: 60, fine: 30, coda: null })
    expect(screen.getByRole('alert')).toHaveTextContent('La fine della sigla viene prima')
  })

  it('senza la durata del video la sigla finale non si può scrivere', () => {
    monta(PUNTI_VUOTI, { durataVideo: null })
    expect(screen.getByLabelText('Inizio della sigla finale')).toBeDisabled()
  })

  it('alla sigla finale: passare subito o guardarla fino alla fine', () => {
    const { onScelte } = monta()
    expect(screen.getByLabelText('Guardala fino alla fine, poi passa al prossimo')).toBeChecked()
    fireEvent.click(screen.getByLabelText('Passa subito al prossimo episodio'))
    expect(onScelte).toHaveBeenLastCalledWith({ fine: true })
  })

  it('i tempi si cancellano tutti insieme', () => {
    const { onCambia } = monta({ inizio: 4, fine: 34, coda: 31 })
    fireEvent.click(screen.getByRole('button', { name: 'Cancella i tempi di questa serie' }))
    expect(onCambia).toHaveBeenLastCalledWith({ inizio: null, fine: null, coda: null })
  })
})
