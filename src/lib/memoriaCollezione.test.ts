import { describe, expect, it, vi } from 'vitest'
import { creaMemoria } from './memoriaCollezione'

describe('creaMemoria', () => {
  it('due pagine che chiedono insieme fanno una richiesta sola', async () => {
    const m = creaMemoria<number[]>(60_000)
    const carica = vi.fn(async () => [1, 2])
    const [a, b] = await Promise.all([m.leggi('u1', carica), m.leggi('u1', carica)])
    expect(carica).toHaveBeenCalledOnce()
    expect(a).toEqual([1, 2])
    expect(b).toEqual([1, 2])
  })

  it('poco dopo riusa la lettura, scaduto il tempo la rifà', async () => {
    let adesso = 0
    const m = creaMemoria<number>(60_000, () => adesso)
    const carica = vi.fn(async () => 7)
    await m.leggi('u1', carica)
    adesso = 59_000
    await m.leggi('u1', carica)
    expect(carica).toHaveBeenCalledTimes(1)
    adesso = 61_000
    await m.leggi('u1', carica)
    expect(carica).toHaveBeenCalledTimes(2)
  })

  it('dopo un salvataggio si rilegge: dimentica() la svuota', async () => {
    const m = creaMemoria<number>(60_000)
    const carica = vi.fn(async () => 1)
    await m.leggi('u1', carica)
    m.dimentica()
    await m.leggi('u1', carica)
    expect(carica).toHaveBeenCalledTimes(2)
  })

  it('un altro utente non vede la collezione del primo', async () => {
    const m = creaMemoria<string>(60_000)
    await m.leggi('u1', async () => 'di u1')
    expect(await m.leggi('u2', async () => 'di u2')).toBe('di u2')
  })

  it('una lettura fallita non resta in memoria', async () => {
    const m = creaMemoria<number>(60_000)
    await expect(m.leggi('u1', async () => Promise.reject(new Error('rete')))).rejects.toThrow('rete')
    expect(await m.leggi('u1', async () => 3)).toBe(3)
  })

  it('un salvataggio a lettura in corso non lascia in memoria i dati di prima', async () => {
    const m = creaMemoria<number>(60_000)
    let chiudi: (n: number) => void = () => {}
    const vecchia = m.leggi('u1', () => new Promise<number>((r) => (chiudi = r)))
    m.dimentica()
    chiudi(1)
    await vecchia
    const carica = vi.fn(async () => 2)
    expect(await m.leggi('u1', carica)).toBe(2)
    expect(carica).toHaveBeenCalledOnce()
  })
})

describe('chi scrive nella collezione', () => {
  it('svuota la memoria: altrimenti le pagine mostrerebbero i dati di prima', async () => {
    const { readdirSync, readFileSync } = await import('node:fs')
    const dir = new URL('./', import.meta.url)
    const scoperte: string[] = []
    for (const nome of readdirSync(dir)) {
      if (!/\.tsx?$/.test(nome) || nome.includes('.test.')) continue
      const testo = readFileSync(new URL(nome, dir), 'utf8')
      const tabella = /const TABLE = 'user_titles'/.test(testo) ? /\.from\((?:'user_titles'|TABLE)\)/g : /\.from\('user_titles'\)/g
      // Ogni accesso alla tabella fino al successivo: se scrive, deve dimenticare.
      const pezzi = testo.split(tabella).slice(1).map((p) => p.split('.from(')[0])
      if (pezzi.some((p) => /\.(?:upsert|update|insert|delete)\(/.test(p) && !p.includes('dimenticaCollezione()')))
        scoperte.push(nome)
    }
    expect(scoperte).toEqual([])
  })
})
