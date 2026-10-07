import type { VoceStreaming } from './streaming'

// Un file sostituito su Drive (lo script che ricodifica in H.264 carica il
// nuovo e cancella l'originale) ha un id nuovo, e i progressi stanno nella
// riga dell'id vecchio: gli episodi di South Park già visti tornavano «da
// vedere» uno sì e uno no, secondo quali erano stati ricodificati. Il file
// nuovo prende «visto» e posizione da quello che ha sostituito: stesso titolo
// di TMDB, stesso episodio, e il vecchio non più su Drive.

type Progressi = Pick<VoceStreaming, 'visto_il' | 'posizione' | 'durata' | 'secondi_visti'>

const stessoTitolo = (a: VoceStreaming, b: VoceStreaming) =>
  a.media_type === b.media_type &&
  a.tmdb_id === b.tmdb_id &&
  (a.media_type !== 'tv' || (a.stagione === b.stagione && a.episodio === b.episodio))

const haProgressi = (r: VoceStreaming) => !!r.visto_il || r.posizione > 0

export function progressiDaEreditare(
  righe: VoceStreaming[],
  presenti: Set<string>,
): { fileId: string; campi: Progressi }[] {
  const scomparse = righe.filter((r) => !presenti.has(r.drive_file_id) && r.tmdb_id && haProgressi(r))
  if (scomparse.length === 0) return []
  const esito: { fileId: string; campi: Progressi }[] = []
  for (const r of righe) {
    // Solo un file ancora su Drive, riconosciuto, e senza progressi suoi: ciò
    // che si guarda col file nuovo non viene mai sovrascritto.
    if (!presenti.has(r.drive_file_id) || !r.tmdb_id || !r.media_type || haProgressi(r)) continue
    if (r.media_type === 'tv' && (r.stagione == null || r.episodio == null)) continue
    // Prima quello visto, poi quello andato più avanti.
    const origine = scomparse
      .filter((s) => stessoTitolo(s, r))
      .sort((a, b) => Number(!!b.visto_il) - Number(!!a.visto_il) || b.posizione - a.posizione)[0]
    if (!origine) continue
    esito.push({
      fileId: r.drive_file_id,
      campi: {
        visto_il: origine.visto_il,
        posizione: origine.posizione,
        durata: origine.durata,
        secondi_visti: origine.secondi_visti,
      },
    })
  }
  return esito
}
