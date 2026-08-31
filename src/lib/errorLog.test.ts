import { describe, it, expect } from 'vitest'
import {
  costruisciSegnalazione,
  daRegistrare,
  descriviErrore,
  firma,
  MAX_PER_SESSIONE,
} from './errorLog'

describe('descriviErrore', () => {
  it('da una Error prende messaggio e stack', () => {
    const e = new Error('TMDB non risponde')
    const d = descriviErrore(e)
    expect(d.messaggio).toBe('TMDB non risponde')
    expect(d.dettaglio).toContain('Error')
  })

  it('regge una stringa, un oggetto e perfino undefined', () => {
    // Chi chiama `catch (e)` non sa cosa gli arriva: una Error, la risposta di
    // Supabase, o niente. Il caso peggiore — «non so cosa sia successo» — è
    // proprio quello che questa funzione esiste per evitare.
    expect(descriviErrore('boom').messaggio).toBe('boom')
    expect(descriviErrore({ message: 'permesso negato' }).messaggio).toBe('permesso negato')
    expect(descriviErrore({ code: 42 }).messaggio).toBe('Errore non testuale')
    expect(descriviErrore(undefined).messaggio).toBe('undefined')
  })

  it('non si strozza su un oggetto circolare', () => {
    const a: Record<string, unknown> = { message: 'ciclo' }
    a.self = a
    expect(() => descriviErrore(a)).not.toThrow()
    expect(descriviErrore(a).dettaglio).toBeNull()
  })
})

describe('costruisciSegnalazione', () => {
  it('tronca i campi lunghi invece di scrivere romanzi', () => {
    // Uno stack di React non troncato riempie la riga di rumore e rende
    // l'elenco illeggibile proprio quando serve leggerlo.
    const s = costruisciSegnalazione('c'.repeat(300), new Error('m'.repeat(900)))
    expect(s.contesto.length).toBeLessThanOrEqual(120)
    expect(s.messaggio.length).toBeLessThanOrEqual(500)
    expect(s.messaggio.endsWith('…')).toBe(true)
  })

  it('porta con sé la pagina in cui è successo', () => {
    const s = costruisciSegnalazione('statistiche', new Error('x'), {
      percorso: '/statistiche?anno=2025',
    })
    expect(s.percorso).toBe('/statistiche?anno=2025')
  })
})

describe('daRegistrare', () => {
  it('scrive un errore nuovo', () => {
    const s = costruisciSegnalazione('statistiche', new Error('boom'))
    expect(daRegistrare(s, new Set())).toBe(true)
  })

  it('non ripete lo stesso errore due volte', () => {
    // Senza, un ciclo di render che fallisce a ogni giro riempirebbe la
    // tabella di righe identiche: la diagnostica diventerebbe il guasto.
    const s = costruisciSegnalazione('statistiche', new Error('boom'))
    expect(daRegistrare(s, new Set([firma(s)]))).toBe(false)
  })

  it('distingue lo stesso messaggio in posti diversi', () => {
    const a = costruisciSegnalazione('statistiche', new Error('boom'))
    const b = costruisciSegnalazione('diario', new Error('boom'))
    expect(daRegistrare(b, new Set([firma(a)]))).toBe(true)
  })

  it('si ferma al tetto della sessione', () => {
    const piene = new Set(Array.from({ length: MAX_PER_SESSIONE }, (_, i) => `x${i}`))
    const s = costruisciSegnalazione('nuovo', new Error('mai visto'))
    expect(daRegistrare(s, piene)).toBe(false)
  })
})
