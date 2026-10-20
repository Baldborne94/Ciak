// L'episodio da proporre in «Riprendi a guardare», dal diario degli episodi:
// quello dopo l'ultimo visto; se dopo non ne resta nessuno, il primo non visto.
// È la regola della videoteca (prossimoDaGuardare): con «il primo buco
// dall'inizio» la Sala proponeva S6E13 a chi era arrivato alla nona stagione,
// e le due schermate dicevano due cose diverse. Gli speciali (stagione 0) non
// contano. `visti` e `ultimo` usano le chiavi di epKey («stagione-episodio»).
export function prossimoEpisodio(
  stagioni: { seasonNumber: number; episodeCount: number }[],
  visti: Set<string>,
  ultimo: string | null,
): { season: number; episode: number } | null {
  const ordine: { season: number; episode: number }[] = []
  for (const s of stagioni) {
    if (s.seasonNumber <= 0) continue
    for (let e = 1; e <= s.episodeCount; e++) ordine.push({ season: s.seasonNumber, episode: e })
  }
  const chiave = (x: { season: number; episode: number }) => `${x.season}-${x.episode}`
  const dopo = ultimo ? ordine.findIndex((x) => chiave(x) === ultimo) + 1 : 0
  return ordine.slice(dopo).find((x) => !visti.has(chiave(x))) ?? ordine.find((x) => !visti.has(chiave(x))) ?? null
}
