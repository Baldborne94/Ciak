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

  it('apre il video coi suoi sottotitoli, letti subito in WebVTT', async () => {
    const film = await apriFile([
      file('Alien.1979.it.srt', '1\n00:00:01,000 --> 00:00:02,000\nCiao\n'),
      file('Alien.1979.mp4', 'video', 'video/mp4'),
    ])
    expect(film.file.name).toBe('Alien.1979.mp4')
    expect(film.sottotitoli).toHaveLength(1)
    expect(film.sottotitoli[0]).toMatchObject({ lingua: 'it', etichetta: 'Italiano · dal file scelto' })
    expect(film.sottotitoli[0].vtt).toContain('WEBVTT')
    expect(filmAperto(film.id)).toBe(film)
    expect(comeVideo(film)).toMatchObject({ id: film.id, name: 'Alien.1979.mp4', cartella: null })
  })

  it('senza un video lo dice', async () => {
    await expect(apriFile([file('Alien.it.srt')])).rejects.toThrow(/file video/)
  })

  it('riconosce i formati che il browser legge', () => {
    expect(formatoLeggibile('a.mp4')).toBe(true)
    expect(formatoLeggibile('a.MKV')).toBe(false)
  })
})
