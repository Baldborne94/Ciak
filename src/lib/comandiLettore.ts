import { posterUrl } from './tmdb'

// I comandi del lettore che non passano dal video: la tastiera sul computer e
// la schermata di blocco (o le notifiche) del telefono.

// ── Tastiera ─────────────────────────────────────────────────────────────────

export type AzioneTasto = 'pausa' | 'indietro' | 'avanti' | 'schermo' | 'sigla' | 'prossimo' | 'audio' | 'sottotitoli'

// Gli stessi tasti di YouTube, dove ha senso: chi li conosce li ritrova.
const TASTI: Record<string, AzioneTasto> = {
  ' ': 'pausa',
  k: 'pausa',
  ArrowLeft: 'indietro',
  j: 'indietro',
  ArrowRight: 'avanti',
  l: 'avanti',
  f: 'schermo',
  s: 'sigla',
  n: 'prossimo',
  m: 'audio',
  c: 'sottotitoli',
}

export const SALTO_TASTIERA = 10

// Cosa fa un tasto, o null se non è per il lettore: mentre si scrive (la
// ricerca del titolo, i campi stagione ed episodio) i tasti restano ai campi,
// e con Ctrl, Alt o ⌘ restano al browser.
export function azioneTasto(
  e: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean },
  bersaglio: { tagName: string; isContentEditable?: boolean } | null,
): AzioneTasto | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null
  if (bersaglio && (/^(INPUT|TEXTAREA|SELECT)$/.test(bersaglio.tagName) || bersaglio.isContentEditable)) return null
  const tasto = e.key.length === 1 ? e.key.toLowerCase() : e.key
  return TASTI[tasto] ?? null
}

// ── Schermata di blocco ──────────────────────────────────────────────────────

export interface Metadati {
  title: string
  artist: string
  artwork: { src: string; sizes: string; type: string }[]
}

// Cosa mostra il telefono sopra i comandi: il titolo (con l'episodio) e la
// locandina, nelle due misure che servono a notifiche e schermata di blocco.
export function metadatiSessione(titolo: string, posterPath: string | null | undefined): Metadati {
  const artwork = posterPath
    ? ([
        ['w185', '185x278'],
        ['w500', '500x750'],
      ] as const).flatMap(([misura, sizes]) => {
        const src = posterUrl(posterPath, misura)
        return src ? [{ src, sizes, type: 'image/jpeg' }] : []
      })
    : []
  return { title: titolo, artist: 'Ciak', artwork }
}
