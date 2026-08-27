// PostgREST non restituisce mai più di `max_rows` righe per richiesta (di
// default 1000 su Supabase) e NON segnala in alcun modo che ne ha tagliate
// altre: una collezione da 1200 titoli arriva come 1000 righe, senza errori.
// Ogni lettura "prendi tutto" deve quindi sfogliare le pagine, altrimenti
// conta e mostra meno di quello che c'è — in silenzio, che è il modo peggiore.

const PAGE_SIZE = 1000

// Limite di sicurezza: se il server ignorasse `range` e ripetesse sempre le
// stesse righe, il ciclo non finirebbe mai e l'app resterebbe appesa. Un
// milione di righe è ben oltre qualsiasi collezione personale, quindi
// arrivarci significa che qualcosa non va, non che l'utente ha visto tanto.
const MAX_PAGES = 1000

interface PageResult<T> {
  data: T[] | null
  error: { message: string } | null
}

// Sfoglia una query paginata finché non finiscono le righe.
// `page` riceve gli estremi (inclusivi) da passare a `.range()`.
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<T[]> {
  const all: T[] = []
  let from = 0

  for (let i = 0; i < MAX_PAGES; i++) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)

    const rows = data ?? []
    if (rows.length === 0) return all
    all.push(...rows)

    // Avanziamo di quante righe sono ARRIVATE, non di quante ne abbiamo
    // chieste: se il server ne concede meno per richiesta (max_rows più basso
    // della pagina), fermarsi a una pagina corta lascerebbe fuori il resto.
    // Costa una richiesta in più alla fine, che torna vuota e chiude il ciclo.
    from += rows.length
  }

  return all
}
