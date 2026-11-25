import { describe, expect, it } from 'vitest'
import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { funzioni } from './funzioni'

// Sul NAS una funzione di api/ esiste solo se sta nell'elenco del server: una
// dimenticata risponderebbe 404 lì e funzionerebbe su Vercel, cioè si
// scoprirebbe solo usandola.
describe('le funzioni del server del NAS', () => {
  it('ci sono tutte quelle di api/, col loro nome', () => {
    const inApi = readdirSync(resolve(__dirname, '../api'))
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
      .map((f) => f.replace(/\.ts$/, ''))
      .sort()
    expect(Object.keys(funzioni).sort()).toEqual(inApi)
    for (const f of Object.values(funzioni)) expect(typeof f).toBe('function')
  })
})
