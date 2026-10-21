import { describe, expect, it } from 'vitest'
import { abbinaSpeciale, type EpisodioSpeciale } from './specialiTmdb'

// Gli speciali di L'attacco dei giganti come li ha TMDB (stagione 0): The
// Final Chapters sono il 36 e il 37, non l'1.
const SPECIALI: EpisodioSpeciale[] = [
  { numero: 1, nomi: ['Il taccuino di Ilse', "Ilse's Notebook: Memoirs of a Scout Regiment Member"] },
  { numero: 2, nomi: ['The Sudden Visitor: The Torturous Curse of Youth'] },
  { numero: 30, nomi: ['The Final Season Recap'] },
  { numero: 36, nomi: ['Capitoli finali - Speciale (1)', 'The Final Chapters Special (1)'] },
  { numero: 37, nomi: ['Capitoli finali - Speciale (2)', 'The Final Chapters Special (2)'] },
]

describe('abbinaSpeciale', () => {
  it('«THE FINAL CHAPTERS - Special 1» è il 36, e lo Special 2 il 37', () => {
    expect(abbinaSpeciale('Shingeki no Kyojin - The Final Season - S04P03 - THE FINAL CHAPTERS - Special 1.mp4', SPECIALI)).toBe(36)
    expect(abbinaSpeciale('Shingeki no Kyojin - The Final Season - S04P03 - THE FINAL CHAPTERS - Special 2.mp4', SPECIALI)).toBe(37)
  })

  it('un OAD si riconosce dal titolo anche se TMDB non lo numera', () => {
    expect(abbinaSpeciale("Shingeki no Kyojin - OADE01 - Ilse's Notebook.mp4", SPECIALI)).toBe(1)
  })

  it('una parola sola in comune non basta: resta il numero del file', () => {
    expect(abbinaSpeciale('Shingeki no Kyojin - OVA 3 - Visitor.mp4', SPECIALI)).toBeNull()
  })

  it('più episodi possibili: nessuno, invece di tirare a indovinare', () => {
    const doppi = [...SPECIALI, { numero: 40, nomi: ['The Final Chapters Special (1) - Director’s Cut'] }]
    expect(abbinaSpeciale('Shingeki no Kyojin - THE FINAL CHAPTERS - Special 1.mp4', doppi)).toBeNull()
  })

  it('senza speciali su TMDB, niente', () => {
    expect(abbinaSpeciale('Shingeki no Kyojin - THE FINAL CHAPTERS - Special 1.mp4', [])).toBeNull()
  })
})
