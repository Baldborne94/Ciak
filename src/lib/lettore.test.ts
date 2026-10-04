import { describe, it, expect, vi } from 'vitest'
import { decidiErrore, descriviDiagnostica, sessioneInScadenza, TENTATIVI_MAX, vigilanzaSalto } from './lettore'

const base = { codice: 2, posizione: 508, tentativi: 0, connesso: true }

describe('decidiErrore', () => {
  it('un errore di rete a metà film riprende da dove si era', () => {
    // Il caso vero: «annullata a causa di un errore di rete» a 8:28.
    expect(decidiErrore(base)).toBe('riprova')
  })

  it('a film già partito riprova anche per errori che non sono di rete', () => {
    expect(decidiErrore({ ...base, codice: 3 })).toBe('riprova')
  })

  it('dopo troppi tentativi di fila lo dice, invece di girare a vuoto', () => {
    expect(decidiErrore({ ...base, tentativi: TENTATIVI_MAX })).toBe('rete')
  })

  it('con la sessione Google scaduta chiede di ricollegarsi', () => {
    expect(decidiErrore({ ...base, connesso: false })).toBe('sessione')
  })

  it('un file che non parte nemmeno è un formato che il browser non legge', () => {
    expect(decidiErrore({ ...base, codice: 4, posizione: 0 })).toBe('formato')
    // Con Drive che ha risposto bene, l'ultima parola resta al browser.
    expect(decidiErrore({ ...base, codice: 4, posizione: 0, drive: 206 })).toBe('formato')
  })

  it('se Drive ha rifiutato il token è la sessione, non il formato, anche col token che qui sembra buono', () => {
    // Il caso vero: un MP4 fatto da prepara-ciak, sul telefono, «Il browser
    // non riesce a leggere questo file» a 0:00 perché Drive rispondeva 401.
    expect(decidiErrore({ ...base, codice: 4, posizione: 0, drive: 401 })).toBe('sessione')
    expect(decidiErrore({ ...base, drive: 401 })).toBe('sessione')
  })

  it('un file negato o sparito da Drive lo dice, senza riprovare a vuoto', () => {
    expect(decidiErrore({ ...base, codice: 4, posizione: 0, drive: 403 })).toBe('negato')
    expect(decidiErrore({ ...base, drive: 404 })).toBe('assente')
  })

  it('un errore di rete prima di partire si riprova comunque', () => {
    expect(decidiErrore({ ...base, posizione: 0 })).toBe('riprova')
  })
})

describe('sessioneInScadenza', () => {
  const ora = 1_000_000_000
  it('avvisa negli ultimi dieci minuti', () => {
    expect(sessioneInScadenza(ora + 9 * 60_000, ora)).toBe(true)
    expect(sessioneInScadenza(ora - 1, ora)).toBe(true)
  })

  it('tace quando manca ancora tempo, o quando non c’è sessione', () => {
    expect(sessioneInScadenza(ora + 30 * 60_000, ora)).toBe(false)
    expect(sessioneInScadenza(0, ora)).toBe(false)
  })
})

describe('descriviDiagnostica', () => {
  const base = {
    quando: Date.UTC(2026, 8, 30, 18, 0, 0),
    ms: 420,
    range: 'bytes=1000-',
    status: 206,
    redirect: null,
    contentLength: '9000',
    totale: 10000,
    esito: 'ok' as const,
  }

  it('dice cosa è stato chiesto e cosa ha risposto Drive', () => {
    expect(descriviDiagnostica(base)).toMatch(
      /chiesto bytes=1000- → Drive ha risposto 206, 9000 byte \(file di 10000 byte, 420 ms\)$/,
    )
  })

  it('un Range ignorato si legge subito', () => {
    expect(descriviDiagnostica({ ...base, status: 200, esito: 'range-ignorato' })).toContain(
      'Drive ha ignorato il Range e ha mandato tutto il file',
    )
  })

  it('un pezzo servito dal film scaricato lo dice', () => {
    expect(descriviDiagnostica({ ...base, esito: 'dispositivo' })).toContain(
      'chiesto bytes=1000- → servito dal film scaricato sul dispositivo (10000 byte)',
    )
  })

  it('una richiesta rifiutata dal browser si legge col suo motivo', () => {
    expect(descriviDiagnostica({ ...base, status: 0, esito: 'rifiutata', errore: 'Failed to fetch' })).toContain(
      'il browser ha rifiutato la richiesta a Drive (Failed to fetch)',
    )
  })

  it('segnala un reindirizzamento e una dimensione sconosciuta', () => {
    const riga = descriviDiagnostica({ ...base, range: null, redirect: 'altro.googleusercontent.com', totale: null })
    expect(riga).toContain('chiesto tutto il file')
    expect(riga).toContain('dimensione del file sconosciuta')
    expect(riga).toContain('reindirizzato a altro.googleusercontent.com')
  })
})

describe('vigilanzaSalto', () => {
  it('avvisa se il salto non finisce in tempo', () => {
    vi.useFakeTimers()
    const suBlocco = vi.fn()
    const v = vigilanzaSalto(suBlocco, 1000)
    v.inizio()
    vi.advanceTimersByTime(999)
    expect(suBlocco).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(suBlocco).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('un salto finito in tempo non avvisa, e un nuovo salto riparte da capo', () => {
    vi.useFakeTimers()
    const suBlocco = vi.fn()
    const v = vigilanzaSalto(suBlocco, 1000)
    v.inizio()
    vi.advanceTimersByTime(800)
    v.fine()
    vi.advanceTimersByTime(1000)
    expect(suBlocco).not.toHaveBeenCalled()
    v.inizio()
    vi.advanceTimersByTime(800)
    v.inizio() // un altro salto: l'attesa ricomincia
    vi.advanceTimersByTime(800)
    expect(suBlocco).not.toHaveBeenCalled()
    vi.advanceTimersByTime(200)
    expect(suBlocco).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
})
