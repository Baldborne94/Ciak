import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { logFailure } from './logFailure'
import { registraErrore } from './errorLog'

vi.mock('./errorLog', () => ({ registraErrore: vi.fn() }))

const registra = vi.mocked(registraErrore)

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('logFailure', () => {
  it('scrive in console E nel diario', () => {
    // È il punto di tutta la modifica: la console la guarda solo chi ce l'ha
    // aperta adesso, cioè quasi mai. Il diario resta.
    logFailure('anni di uscita')(new Error('TMDB giù'))

    expect(console.error).toHaveBeenCalled()
    expect(registra).toHaveBeenCalledWith('anni di uscita', expect.any(Error))
  })

  it('non aspetta la scrittura del diario', () => {
    // Chi chiama sta già gestendo un guasto: non deve restare appeso alla
    // diagnostica. La funzione torna sincrona anche se la scrittura è lenta.
    registra.mockReturnValue(new Promise(() => {}))
    expect(() => logFailure('qualcosa')('boom')).not.toThrow()
  })

  it('passa avanti anche ciò che non è una Error', () => {
    logFailure('salvataggio')({ message: 'permesso negato' })
    expect(registra).toHaveBeenCalledWith('salvataggio', { message: 'permesso negato' })
  })
})
