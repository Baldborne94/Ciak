import { describe, expect, it } from 'vitest'
import { apriFile, comeVideo, eLocale, filmAperto, formatoLeggibile, idLocale } from './filmLocali'

const file = (nome: string, contenuto = 'x', tipo = '') => new File([contenuto], nome, { type: tipo })

describe('filmLocali', () => {
  it('lo stesso file ha sempre lo stesso id, un altro no', () => {
    const a = idLocale({ name: 'Alien.1979.mp4', size: 1000 })
    expect(a).toMatch(/^loc-[0-9a-f]{16}$/)
    expect(idLocale({ name: 'Alien.1979.mp4', size: 1000 })).toBe(a)
    expect(idLocale({ name: 'Alien.1979.mp4', size: 1001 })).not.toBe(a)
    expect(eLocale(a)).toBe(true)
    expect(eLocale('1AbCdEfGhIjKlMn')).toBe(false)
  })

  it('apre il video coi file scelti insieme a lui, da cui il lettore prende i sottotitoli', () => {
    const srt = file('Alien.1979.it.srt', '1\n00:00:01,000 --> 00:00:02,000\nCiao\n')
    const film = apriFile([srt, file('Alien.1979.mp4', 'video', 'video/mp4')])
    expect(film.file.name).toBe('Alien.1979.mp4')
    expect(film.vicini).toContain(srt)
    expect(film).toMatchObject({ origine: 'scelto', cartella: null, scrivi: null })
    expect(filmAperto(film.id)).toBe(film)
    expect(comeVideo(film)).toMatchObject({ id: film.id, name: 'Alien.1979.mp4', cartella: null })
  })

  it('senza un video lo dice', () => {
    expect(() => apriFile([file('Alien.it.srt')])).toThrow(/file video/)
  })

  it('riconosce i formati che il browser legge', () => {
    expect(formatoLeggibile('a.mp4')).toBe(true)
    expect(formatoLeggibile('a.MKV')).toBe(false)
  })
})
