// TheIntroDB: dove sta la sigla di un episodio, e dove partono i titoli di
// coda. Le parti pure, condivise dal browser (che lo chiede direttamente) e
// dalla funzione /api/sigle (che resta come riserva).

export const BASE_THEINTRODB = 'https://api.theintrodb.org/v3/media'

export interface Episodio {
  tmdbId: number
  stagione: number
  episodio: number
}

export interface SigleEpisodio {
  inizio: { da: number; a: number } | null // sigla iniziale, in secondi
  finale: { da: number } | null // da qui in poi titoli di coda
}

export function urlTheIntroDb({ tmdbId, stagione, episodio }: Episodio): string {
  return `${BASE_THEINTRODB}?tmdb_id=${tmdbId}&season=${stagione}&episode=${episodio}`
}

type Segmento = { start_ms?: unknown; end_ms?: unknown }
const ms = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null)
const segmenti = (v: unknown): Segmento[] => (Array.isArray(v) ? v.filter((s): s is Segmento => !!s && typeof s === 'object') : [])

// Come le leggono i client di TheIntroDB: un inizio nullo è l'inizio
// dell'episodio, una fine nulla dei titoli di coda è la fine dell'episodio, e
// un segmento lungo zero vuol dire «qui non c'è».
export function normalizzaSigle(dati: unknown): SigleEpisodio {
  const d = (dati && typeof dati === 'object' ? dati : {}) as Record<string, unknown>
  let inizio: SigleEpisodio['inizio'] = null
  for (const s of segmenti(d.intro)) {
    const a = ms(s.end_ms)
    if (!a) continue
    inizio = { da: (ms(s.start_ms) ?? 0) / 1000, a: a / 1000 }
    break
  }
  let finale: SigleEpisodio['finale'] = null
  for (const s of segmenti(d.credits)) {
    const da = ms(s.start_ms)
    if (!da) continue
    finale = { da: da / 1000 }
    break
  }
  return { inizio, finale }
}
