import { describe, it, expect } from 'vitest'
import {
  TABELLE_ESPORTATE,
  costruisciEsportazione,
  nomeFileEsportazione,
  riassuntoEsportazione,
} from './exportData'

const UTENTE = { id: 'u1', email: 'spettatore@ciak.test' }
const QUANDO = new Date('2026-08-30T21:00:00Z')

describe('costruisciEsportazione', () => {
  it('conta le righe di tutte le tabelle, non solo della prima', () => {
    const dati = costruisciEsportazione(
      UTENTE,
      { user_titles: [{ id: 1 }, { id: 2 }], user_diary: [{ id: 3 }] },
      [],
      16,
      QUANDO,
    )
    expect(dati.righeTotali).toBe(3)
    expect(dati.esportatoIl).toBe('2026-08-30T21:00:00.000Z')
    expect(dati.schema).toBe(16)
  })

  it('scrive nel file quali tabelle non è riuscito a leggere', () => {
    // Il punto di tutta la funzione: un backup incompleto deve dichiararsi
    // tale dentro il file, non solo in un messaggio a schermo che si perde.
    const dati = costruisciEsportazione(
      UTENTE,
      { user_titles: [{ id: 1 }] },
      [{ tabella: 'user_trailers', errore: 'relation does not exist' }],
      15,
      QUANDO,
    )
    expect(dati.problemi).toHaveLength(1)
    expect(dati.problemi[0].tabella).toBe('user_trailers')
  })

  it('resta leggibile una volta passato da JSON', () => {
    // È il vero formato del backup: se un campo non sopravvive al giro, il
    // file scaricato non vale niente.
    const dati = costruisciEsportazione(UTENTE, { user_titles: [{ id: 1 }] }, [], 16, QUANDO)
    const riletto = JSON.parse(JSON.stringify(dati))
    expect(riletto.formato).toBe('ciak-export')
    expect(riletto.versione).toBe(1)
    expect(riletto.tabelle.user_titles[0].id).toBe(1)
    expect(riletto.utente.id).toBe('u1')
  })
})

describe('TABELLE_ESPORTATE', () => {
  it('non include cache, contatori e iscrizioni push', () => {
    // Sono dati ricostruibili o legati a un singolo dispositivo: in un backup
    // fanno solo peso.
    const escluse = ['user_song_cache', 'ai_usage', 'push_subscriptions']
    for (const t of escluse) expect(TABELLE_ESPORTATE).not.toContain(t)
  })

  it('include tutto ciò che l utente ha scritto a mano', () => {
    for (const t of ['user_titles', 'user_diary', 'user_lists', 'user_list_items']) {
      expect(TABELLE_ESPORTATE).toContain(t)
    }
  })
})

describe('nomeFileEsportazione', () => {
  it('mette la data in testa, così i backup si ordinano da soli', () => {
    expect(nomeFileEsportazione(QUANDO)).toBe('ciak-backup-2026-08-30.json')
  })
})

describe('riassuntoEsportazione', () => {
  it('dice quante righe e da quante tabelle, al singolare quando è una', () => {
    const una = costruisciEsportazione(UTENTE, { user_titles: [{ id: 1 }] }, [], 16, QUANDO)
    expect(riassuntoEsportazione(una)).toBe('1 riga da 1 tabella.')

    const tante = costruisciEsportazione(
      UTENTE,
      { user_titles: [{ id: 1 }, { id: 2 }], user_diary: [] },
      [],
      16,
      QUANDO,
    )
    expect(riassuntoEsportazione(tante)).toBe('2 righe da 2 tabelle.')
  })

  it('nomina le tabelle mancanti invece di dire solo "fatto"', () => {
    const dati = costruisciEsportazione(
      UTENTE,
      { user_titles: [{ id: 1 }] },
      [{ tabella: 'user_trailers', errore: 'boom' }],
      15,
      QUANDO,
    )
    expect(riassuntoEsportazione(dati)).toContain('user_trailers')
  })
})
