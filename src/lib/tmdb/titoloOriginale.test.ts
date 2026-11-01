import { describe, it, expect } from 'vitest'
import { titoloOriginale } from './titles'

// Il titolo originale sotto quello italiano: solo quando dice qualcosa di più.

describe('titoloOriginale', () => {
  it('compare quando è diverso dall italiano, anche in un altro alfabeto', () => {
    expect(titoloOriginale({ title: 'La canzone del mare', originalTitle: 'Song of the Sea' })).toBe('Song of the Sea')
    expect(titoloOriginale({ title: 'La città incantata', originalTitle: '千と千尋の神隠し' })).toBe('千と千尋の神隠し')
  })

  it('non ripete un titolo uguale, a parte maiuscole, accenti e punteggiatura', () => {
    expect(titoloOriginale({ title: 'Oppenheimer', originalTitle: 'Oppenheimer' })).toBeNull()
    expect(titoloOriginale({ title: 'Amélie', originalTitle: 'amelie' })).toBeNull()
    expect(titoloOriginale({ title: 'Mission: Impossible', originalTitle: 'Mission Impossible' })).toBeNull()
    expect(titoloOriginale({ title: 'X', originalTitle: null })).toBeNull()
  })

  it('se l italiano non si legge e si mostra già l originale, non lo ripete sotto', () => {
    expect(titoloOriginale({ title: '기생충', originalTitle: 'Parasite' })).toBeNull()
  })
})
