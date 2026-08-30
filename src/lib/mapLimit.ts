// `Promise.all(lista.map(...))` parte bene finché la lista è corta, ma su una
// watchlist da qualche centinaio di titoli apre tutte le richieste insieme: il
// browser ne lascia passare poche per volta e mette le altre in coda, TMDB
// inizia a rispondere 429, e la pagina resta ferma finché non finisce la
// valanga. Con un tetto le richieste partono a scaglioni e i primi risultati
// arrivano subito.
//
// L'ordine dei risultati resta quello della lista in ingresso, come Promise.all.
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return []

  const results = new Array<R>(items.length)
  let next = 0

  // Ogni "operaio" pesca il prossimo indice libero finché non finiscono.
  async function worker(): Promise<void> {
    for (;;) {
      const i = next++
      if (i >= items.length) return
      results[i] = await fn(items[i], i)
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, worker)
  await Promise.all(workers)
  return results
}
