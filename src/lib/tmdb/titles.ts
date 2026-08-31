import type { RawMedia, RawAltTitle } from './raw'

// Languages written in Latin script — readable as-is. For everything else
// (Japanese, Korean, Chinese, …) the original title isn't useful, so we fall
// back to the localized (Italian/English) title.
const LATIN_LANGS = new Set([
  'en', 'it', 'es', 'fr', 'de', 'pt', 'nl', 'sv', 'da', 'no', 'fi', 'pl',
  'cs', 'hu', 'ro', 'tr', 'id', 'vi', 'ca', 'hr', 'sk', 'sl', 'et', 'lv',
  'lt', 'is', 'ga', 'eu', 'gl', 'af', 'sw', 'ms', 'tl',
])

// True when the string is in a script we can read (no CJK, Hangul, Thai,
// Arabic, Cyrillic, Hebrew, Devanagari, kana…).
// eslint-disable-next-line no-misleading-character-class
const NON_LATIN_SCRIPTS = new RegExp('[\\u0400-\\u05FF\\u0600-\\u06FF\\u0900-\\u097F\\u0E00-\\u0E7F\\u3000-\\u30FF\\u3400-\\u9FFF\\uAC00-\\uD7AF]')

export function isReadableTitle(s: string | null | undefined): boolean {
  if (!s) return false
  // Reject Cyrillic/Hebrew, Arabic, Devanagari, Thai, CJK punct + kana, CJK, Hangul.
  return !NON_LATIN_SCRIPTS.test(s)
}

// Quando né il titolo italiano né l'originale sono leggibili, cerchiamo il
// miglior titolo alternativo fra quelli che TMDB già conosce. Non traduciamo
// noi: scegliamo, in ordine di attendibilità, fra ciò che il catalogo espone.
//
// L'inglese viene prima perché è la lingua in cui questi film circolano fuori
// dal loro paese. Poi i titoli alternativi, dove finisce il titolo
// internazionale quando manca una traduzione vera e propria — prima le edizioni
// US/GB, poi qualunque altra leggibile (spesso è la stessa dicitura). Da ultimo
// le altre traduzioni: un titolo francese o spagnolo resta comunque più utile
// di una riga di ideogrammi per chi deve riconoscere il film.
export function fallbackReadableTitle(
  english: string | null | undefined,
  alternatives: RawAltTitle[] = [],
  translations: { iso_639_1?: string; data?: { title?: string; name?: string } }[] = [],
): string | null {
  if (isReadableTitle(english)) return english as string

  const readableAlts = alternatives.filter((a) => isReadableTitle(a.title))
  const international =
    readableAlts.find((a) => a.iso_3166_1 === 'US' || a.iso_3166_1 === 'GB') ?? readableAlts[0]
  if (international?.title) return international.title

  for (const t of translations) {
    const candidate = t.data?.title || t.data?.name
    if (isReadableTitle(candidate)) return candidate as string
  }

  return null
}

// The best title to show: original if it's in a readable script, otherwise
// the localized one — and never a non-readable script when a readable
// alternative exists (so anime/foreign titles show their IT/EN name).
export function displayTitle(item: {
  title: string
  originalTitle: string | null
  originalLanguage: string | null
}): string {
  if (item.originalTitle && item.originalLanguage && LATIN_LANGS.has(item.originalLanguage)) {
    return item.originalTitle
  }
  if (isReadableTitle(item.title)) return item.title
  if (isReadableTitle(item.originalTitle)) return item.originalTitle as string
  return item.title || item.originalTitle || 'Senza titolo'
}

// When the localized (it-IT) title is in a non-readable script (CJK, Hangul,
// Cyrillic…), patch it in place with the English title, matched by id — so
// foreign titles TMDB hasn't translated to Italian at least show in English
// instead of the raw script.
export function patchReadableTitles(itResults: RawMedia[], enResults: RawMedia[]): void {
  const enTitle = new Map<number, string>()
  for (const r of enResults) enTitle.set(r.id, (r.title ?? r.name) ?? '')
  for (const r of itResults) {
    if (isReadableTitle(r.title ?? r.name)) continue
    const e = enTitle.get(r.id)
    if (!isReadableTitle(e)) continue
    if (r.title !== undefined) r.title = e
    else r.name = e
  }
}
