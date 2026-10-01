import { corrispondeRicerca } from './ricercaLista'

// Cercare, filtrare e ordinare la videoteca: con centinaia di file l'ordine
// alfabetico dei nomi da solo non basta più per ritrovare qualcosa.

export type OrdineVideoteca = 'titolo' | 'anno-desc' | 'anno-asc' | 'aggiunti' | 'guardati'

export const ORDINI_VIDEOTECA: { value: OrdineVideoteca; label: string }[] = [
  { value: 'titolo', label: 'Titolo (A-Z)' },
  { value: 'anno-desc', label: 'Anno: più recenti' },
  { value: 'anno-asc', label: 'Anno: più vecchi' },
  { value: 'aggiunti', label: 'Aggiunti di recente' },
  { value: 'guardati', label: 'Guardati di recente' },
]

export interface RigaVideoteca {
  id: string
  nome: string // il titolo mostrato
  file: string // il nome del file su Drive, anche lui ricercabile
  anno: string | null
  generi: number[]
  titoli: string[] // originale e inglese, per la ricerca
  aggiunto: string | null // quando è arrivato su Drive (ISO)
  guardato: string | null // l'ultima volta che lo si è guardato (ISO)
}

// Un genere scelto (id di TMDB) o null per tutti; la ricerca guarda titolo,
// titolo originale e inglese, e nome del file.
export function filtraVideoteca(righe: RigaVideoteca[], { query, genere }: { query: string; genere: number | null }): RigaVideoteca[] {
  return righe.filter(
    (r) => (genere === null || r.generi.includes(genere)) && corrispondeRicerca(query, [r.nome, r.file, ...r.titoli]),
  )
}

// «S1E2» prima di «S1E10»: il confronto numerico tiene gli episodi in ordine.
const perNome = (a: RigaVideoteca, b: RigaVideoteca) =>
  a.nome.localeCompare(b.nome, 'it', { numeric: true, sensitivity: 'base' })

// In fondo ciò che non ha il dato (anno sconosciuto, mai guardato), in ordine
// di titolo: un titolo senza anno non deve finire in testa agli «più recenti».
function perCampo(campo: (r: RigaVideoteca) => string | null, discendente: boolean) {
  return (a: RigaVideoteca, b: RigaVideoteca) => {
    const va = campo(a)
    const vb = campo(b)
    if (va && vb && va !== vb) return discendente ? vb.localeCompare(va) : va.localeCompare(vb)
    if (va && !vb) return -1
    if (!va && vb) return 1
    return perNome(a, b)
  }
}

export function ordinaVideoteca(righe: RigaVideoteca[], ordine: OrdineVideoteca): RigaVideoteca[] {
  const confronto =
    ordine === 'anno-desc'
      ? perCampo((r) => r.anno, true)
      : ordine === 'anno-asc'
        ? perCampo((r) => r.anno, false)
        : ordine === 'aggiunti'
          ? perCampo((r) => r.aggiunto, true)
          : ordine === 'guardati'
            ? perCampo((r) => r.guardato, true)
            : perNome
  return [...righe].sort(confronto)
}

// I generi presenti nella videoteca, con quanti titoli ciascuno: il filtro
// propone solo quelli che trovano qualcosa.
export function generiPresenti(righe: RigaVideoteca[], nomi: Map<number, string>): { id: number; nome: string; quanti: number }[] {
  const conta = new Map<number, number>()
  for (const r of righe) for (const g of new Set(r.generi)) conta.set(g, (conta.get(g) ?? 0) + 1)
  return [...conta.entries()]
    .filter(([id]) => nomi.has(id))
    .map(([id, quanti]) => ({ id, nome: nomi.get(id) as string, quanti }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'it'))
}
