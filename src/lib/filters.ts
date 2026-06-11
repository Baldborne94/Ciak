// Shared option lists for the advanced filters (year / language / country).

export const LANGUAGES: { value: string; label: string }[] = [
  { value: 'en', label: 'Inglese' },
  { value: 'it', label: 'Italiano' },
  { value: 'ja', label: 'Giapponese' },
  { value: 'ko', label: 'Coreano' },
  { value: 'zh', label: 'Cinese' },
  { value: 'fr', label: 'Francese' },
  { value: 'es', label: 'Spagnolo' },
  { value: 'de', label: 'Tedesco' },
  { value: 'pt', label: 'Portoghese' },
  { value: 'hi', label: 'Hindi' },
  { value: 'ru', label: 'Russo' },
  { value: 'sv', label: 'Svedese' },
  { value: 'da', label: 'Danese' },
  { value: 'nl', label: 'Olandese' },
]

export const COUNTRIES: { value: string; label: string }[] = [
  { value: 'US', label: 'Stati Uniti' },
  { value: 'IT', label: 'Italia' },
  { value: 'GB', label: 'Regno Unito' },
  { value: 'JP', label: 'Giappone' },
  { value: 'KR', label: 'Corea del Sud' },
  { value: 'FR', label: 'Francia' },
  { value: 'ES', label: 'Spagna' },
  { value: 'DE', label: 'Germania' },
  { value: 'CN', label: 'Cina' },
  { value: 'IN', label: 'India' },
  { value: 'CA', label: 'Canada' },
  { value: 'AU', label: 'Australia' },
  { value: 'BR', label: 'Brasile' },
  { value: 'MX', label: 'Messico' },
]

// Years from the current one down to 1950 (descending).
export const YEARS: string[] = Array.from(
  { length: new Date().getFullYear() - 1949 },
  (_, i) => String(new Date().getFullYear() - i),
)
