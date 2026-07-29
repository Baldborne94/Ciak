import { describe, it, expect } from 'vitest'
import { getPageState, setPageState } from './pageStateCache'

describe('pageStateCache', () => {
  it('torna undefined per chiavi mai salvate', () => {
    expect(getPageState('mai-vista')).toBeUndefined()
  })

  it('salva e recupera lo stato per chiave', () => {
    setPageState('k1', { scroll: 120 })
    expect(getPageState<{ scroll: number }>('k1')).toEqual({ scroll: 120 })
  })

  it('sovrascrive lo stato esistente e tiene chiavi separate', () => {
    setPageState('k1', { scroll: 300 })
    setPageState('k2', [1, 2, 3])
    expect(getPageState<{ scroll: number }>('k1')).toEqual({ scroll: 300 })
    expect(getPageState<number[]>('k2')).toEqual([1, 2, 3])
  })
})
