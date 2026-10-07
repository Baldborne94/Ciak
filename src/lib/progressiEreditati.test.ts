import { describe, expect, it } from 'vitest'
import { progressiDaEreditare } from './progressiEreditati'
import type { VoceStreaming } from './streaming'

const voce = (id: string, campi: Partial<VoceStreaming> = {}): VoceStreaming => ({
  drive_file_id: id,
  nome_file: null,
  tmdb_id: 2190,
  media_type: 'tv',
  titolo: 'South Park',
  poster_path: null,
  stagione: 4,
  episodio: 1,
  abbinato_a_mano: false,
  posizione: 0,
  durata: null,
  secondi_visti: 0,
  visto_il: null,
  ...campi,
})

describe('i progressi di un file sostituito', () => {
  it('il file ricodificato eredita «visto» e posizione da quello che ha sostituito', () => {
    // South Park S04E01 guardato, poi ricodificato dallo script: il file nuovo
    // ha un altro id, e senza questo risultava mai visto.
    const vecchio = voce('vecchio', { visto_il: '2026-10-01T20:00:00Z', posizione: 1300, durata: 1320, secondi_visti: 1250 })
    const nuovo = voce('nuovo')
    expect(progressiDaEreditare([vecchio, nuovo], new Set(['nuovo']))).toEqual([
      { fileId: 'nuovo', campi: { visto_il: '2026-10-01T20:00:00Z', posizione: 1300, durata: 1320, secondi_visti: 1250 } },
    ])
  })

  it('anche un episodio lasciato a metà riprende da dove era', () => {
    const vecchio = voce('vecchio', { posizione: 600, durata: 1320, secondi_visti: 590 })
    expect(progressiDaEreditare([vecchio, voce('nuovo')], new Set(['nuovo']))[0].campi).toMatchObject({ posizione: 600 })
  })

  it('un file nuovo che ha già i suoi progressi non si tocca', () => {
    const vecchio = voce('vecchio', { visto_il: '2026-10-01T20:00:00Z', posizione: 1300 })
    expect(progressiDaEreditare([vecchio, voce('nuovo', { posizione: 30 })], new Set(['nuovo']))).toEqual([])
  })

  it('si eredita solo dallo stesso episodio, e solo da un file che non c è più', () => {
    const altroEpisodio = voce('e2', { episodio: 2, visto_il: '2026-10-01T20:00:00Z' })
    const altraSerie = voce('sp', { tmdb_id: 1, visto_il: '2026-10-01T20:00:00Z' })
    const ancoraPresente = voce('doppione', { visto_il: '2026-10-01T20:00:00Z' })
    const righe = [altroEpisodio, altraSerie, ancoraPresente, voce('nuovo')]
    expect(progressiDaEreditare(righe, new Set(['nuovo', 'doppione']))).toEqual([])
  })

  it('fra più file vecchi vale quello visto, poi quello andato più avanti', () => {
    const meta = voce('a', { posizione: 900 })
    const visto = voce('b', { visto_il: '2026-10-02T20:00:00Z', posizione: 1300 })
    expect(progressiDaEreditare([meta, visto, voce('nuovo')], new Set(['nuovo']))[0].campi.visto_il).toBe('2026-10-02T20:00:00Z')
  })

  it('vale anche per i film', () => {
    const vecchio = voce('v', { media_type: 'movie', tmdb_id: 129, stagione: null, episodio: null, visto_il: '2026-10-01T20:00:00Z' })
    const nuovo = voce('n', { media_type: 'movie', tmdb_id: 129, stagione: null, episodio: null })
    expect(progressiDaEreditare([vecchio, nuovo], new Set(['n']))).toHaveLength(1)
  })

  it('un file non riconosciuto non eredita niente', () => {
    const vecchio = voce('v', { visto_il: '2026-10-01T20:00:00Z' })
    expect(progressiDaEreditare([vecchio, voce('n', { tmdb_id: null })], new Set(['n']))).toEqual([])
  })
})
