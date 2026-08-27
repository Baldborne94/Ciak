import { describe, it, expect } from 'vitest'
import { fetchAllRows } from './paged'

// Simula PostgREST: un server che possiede `total` righe e non ne concede mai
// più di `maxRows` per richiesta, esattamente come Supabase.
function server(total: number, maxRows = 1000) {
  const calls: { from: number; to: number }[] = []
  const page = (from: number, to: number) => {
    calls.push({ from, to })
    const size = Math.min(to - from + 1, maxRows)
    const data = Array.from({ length: Math.max(0, Math.min(size, total - from)) }, (_, i) => ({
      id: from + i,
    }))
    return Promise.resolve({ data, error: null })
  }
  return { page, calls }
}

describe('fetchAllRows', () => {
  it('restituisce tutte le righe anche oltre il tetto di 1000', () => {
    const { page } = server(2500)
    return expect(fetchAllRows(page).then((r) => r.length)).resolves.toBe(2500)
  })

  it('non perde né duplica righe: gli id sono tutti e una volta sola', async () => {
    const rows = await fetchAllRows<{ id: number }>(server(1200).page)
    expect(new Set(rows.map((r) => r.id)).size).toBe(1200)
    expect(rows[0].id).toBe(0)
    expect(rows[1199].id).toBe(1199)
  })

  it('una collezione piccola costa due richieste: le righe e la conferma che sono finite', async () => {
    const { page, calls } = server(3)
    await expect(fetchAllRows(page)).resolves.toHaveLength(3)
    expect(calls).toHaveLength(2)
  })

  it('continua anche se il server concede meno righe di quante ne chiediamo', async () => {
    // max_rows più basso della pagina: una pagina corta NON significa "finito".
    // È il caso che aveva fatto tornare il bug dopo la prima correzione.
    const rows = await fetchAllRows(server(1500, 300).page)
    expect(rows).toHaveLength(1500)
  })

  it('propaga l errore invece di restituire un elenco monco', async () => {
    const page = () => Promise.resolve({ data: null, error: { message: 'permesso negato' } })
    await expect(fetchAllRows(page)).rejects.toThrow('permesso negato')
  })

  it('non si blocca se il server ignora la paginazione e ripete le stesse righe', async () => {
    // Senza il limite di sicurezza il ciclo non finirebbe mai e l'app
    // resterebbe appesa a caricare per sempre.
    const page = () =>
      Promise.resolve({ data: Array.from({ length: 1000 }, (_, i) => ({ id: i })), error: null })
    const rows = await fetchAllRows(page)
    expect(rows.length).toBeGreaterThan(0)
  })
})
