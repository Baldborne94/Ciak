import { corrispondeRicerca, normalizzaRicerca } from './ricercaLista'
import { analizzaNomeFilm, filmDaCercare, stagioneDaCartella } from './sottotitoli'
import type { VoceStreaming } from './streaming'

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

// ── Le serie: una riga sola, divisa per stagioni ────────────────────────────
// Con South Park in videoteca (più di 300 episodi) una riga per file rendeva
// l'elenco inservibile: gli episodi si raccolgono sotto la loro serie.

export interface EpisodioVideoteca {
  id: string
  nome: string // ciò che si mostra della riga (il file senza estensione)
  file: string
  stagione: number | null
  episodio: number | null
  visto: boolean
  posizione: number
  durata: number | null
  guardato: string | null // l'ultima volta che lo si è guardato (ISO)
}

// Stagione ed episodio in ordine numerico; gli speciali (stagione 0) dopo le
// stagioni vere, e chi non ha niente in fondo, per nome.
export function ordinaEpisodi(episodi: EpisodioVideoteca[]): EpisodioVideoteca[] {
  const n = (x: number | null) => (x === null ? Number.MAX_SAFE_INTEGER : x === 0 ? Number.MAX_SAFE_INTEGER - 1 : x)
  return [...episodi].sort(
    (a, b) =>
      n(a.stagione) - n(b.stagione) ||
      n(a.episodio) - n(b.episodio) ||
      a.nome.localeCompare(b.nome, 'it', { numeric: true }),
  )
}

// Iniziato e non finito: lo stesso 2% oltre cui la lista mostra la barra.
export function episodioIniziato(e: EpisodioVideoteca): boolean {
  if (e.visto) return false
  return e.durata ? e.posizione / e.durata > 0.02 : e.posizione > 30
}

const piuRecente = (a: EpisodioVideoteca, b: EpisodioVideoteca) => (b.guardato ?? '').localeCompare(a.guardato ?? '')

// L'episodio che «▶ Continua» fa partire: quello lasciato a metà più di
// recente; altrimenti quello dopo l'ultimo finito; altrimenti il primo non
// visto. Seguire l'ultimo visto, e non il primo non visto in assoluto, vuol
// dire che chi guarda solo la terza stagione non viene rimandato alla prima.
export function prossimoDaGuardare(episodi: EpisodioVideoteca[]): EpisodioVideoteca | null {
  const ordinati = ordinaEpisodi(episodi)
  const iniziato = ordinati.filter(episodioIniziato).sort(piuRecente)[0]
  if (iniziato) return iniziato
  const ultimoVisto = ordinati.filter((e) => e.visto).sort(piuRecente)[0]
  if (ultimoVisto) {
    const dopo = ordinati.slice(ordinati.indexOf(ultimoVisto) + 1).find((e) => !e.visto)
    if (dopo) return dopo
  }
  return ordinati.find((e) => !e.visto) ?? null
}

export function perStagione(episodi: EpisodioVideoteca[]): { stagione: number | null; episodi: EpisodioVideoteca[] }[] {
  const gruppi: { stagione: number | null; episodi: EpisodioVideoteca[] }[] = []
  for (const e of ordinaEpisodi(episodi)) {
    const ultimo = gruppi[gruppi.length - 1]
    if (ultimo && ultimo.stagione === e.stagione) ultimo.episodi.push(e)
    else gruppi.push({ stagione: e.stagione, episodi: [e] })
  }
  return gruppi
}

export function sigla(e: Pick<EpisodioVideoteca, 'stagione' | 'episodio'>): string | null {
  return e.stagione !== null && e.episodio !== null ? `S${e.stagione}E${e.episodio}` : null
}

// ── Quali file sono episodi, e di quale serie ───────────────────────────────

export interface VideoDaRaggruppare {
  id: string
  name: string
  cartella: string | null
  serie: string | null
  voce?: Pick<
    VoceStreaming,
    'tmdb_id' | 'media_type' | 'titolo' | 'stagione' | 'episodio' | 'visto_il' | 'posizione' | 'durata' | 'updated_at' | 'poster_path'
  > | null
}

export interface GruppoSerie {
  chiave: string // `tv-${id}` se riconosciuta su TMDB, altrimenti `cartella-…`
  // Il nome della cartella, normalizzato: non cambia quando la serie viene
  // riconosciuta, ed è ciò che ricorda quali serie sono aperte.
  cartella: string
  titolo: string
  tmdb: string // la chiave dei dati di TMDB (anno, generi), '' se non riconosciuta
  posterPath: string | null
  episodi: EpisodioVideoteca[]
  ids: string[]
}

// La serie di un file secondo le cartelle: «South Park (1997)/Season 03/…» e
// «South Park S01E01.mp4» sono la stessa serie.
function nomeSerieDaFile(v: VideoDaRaggruppare): { chiave: string; nome: string } {
  const letto = filmDaCercare(v.name, v.cartella, v.serie)
  const grezzo = v.serie ?? (letto.stagione !== undefined && v.cartella && stagioneDaCartella(v.cartella) === null ? v.cartella : null) ?? letto.titolo
  // «Shingeki no Kyojin [10bits x265]» si mostra senza le etichette della
  // release; l'anno, se c'è, resta: distingue i remake.
  const pulito = analizzaNomeFilm(grezzo)
  const nome = pulito.anno !== undefined ? `${pulito.titolo} (${pulito.anno})` : pulito.titolo
  return { chiave: normalizzaRicerca(pulito.titolo), nome }
}

// Gli episodi raccolti per serie e i file che restano a sé (i film, e un
// episodio isolato e non riconosciuto). Un episodio non ancora riconosciuto
// va sotto la serie riconosciuta della stessa cartella: altrimenti la stessa
// serie compariva due volte, una con gli episodi abbinati a TMDB e una con
// gli altri.
export function raggruppaSerie(video: VideoDaRaggruppare[]): { sciolti: string[]; serie: GruppoSerie[] } {
  const riconosciute = new Map<string, { chiave: string; titolo: string }>()
  for (const v of video) {
    if (v.voce?.media_type !== 'tv' || !v.voce.tmdb_id) continue
    const { chiave } = nomeSerieDaFile(v)
    if (!riconosciute.has(chiave)) riconosciute.set(chiave, { chiave: `tv-${v.voce.tmdb_id}`, titolo: v.voce.titolo ?? chiave })
  }

  const gruppi = new Map<string, GruppoSerie & { riconosciuta: boolean }>()
  const sciolti: string[] = []
  for (const v of video) {
    const voce = v.voce ?? null
    const letto = filmDaCercare(v.name, v.cartella, v.serie)
    const daCartella = nomeSerieDaFile(v)
    const tv = voce?.media_type === 'tv' && !!voce.tmdb_id
    const episodico = tv || (letto.stagione !== undefined && letto.episodio !== undefined) || !!v.serie
    if (!episodico) {
      sciolti.push(v.id)
      continue
    }
    const nota = tv ? { chiave: `tv-${voce?.tmdb_id}`, titolo: voce?.titolo ?? daCartella.nome } : riconosciute.get(daCartella.chiave)
    const chiave = nota?.chiave ?? `cartella-${daCartella.chiave}`
    const g = gruppi.get(chiave) ?? {
      chiave,
      cartella: daCartella.chiave,
      titolo: nota?.titolo ?? daCartella.nome,
      tmdb: nota ? chiave : '',
      posterPath: null,
      episodi: [],
      ids: [],
      riconosciuta: !!nota,
    }
    if (!g.posterPath && voce?.poster_path) g.posterPath = voce.poster_path
    g.episodi.push({
      id: v.id,
      nome: v.name.replace(/\.[a-z0-9]{2,4}$/i, ''),
      file: v.name,
      stagione: voce?.stagione ?? letto.stagione ?? null,
      episodio: voce?.episodio ?? letto.episodio ?? null,
      visto: !!voce?.visto_il,
      posizione: voce?.posizione ?? 0,
      durata: voce?.durata ?? null,
      guardato: voce && voce.posizione > 0 ? (voce.updated_at ?? null) : null,
    })
    g.ids.push(v.id)
    gruppi.set(chiave, g)
  }

  const serie: GruppoSerie[] = []
  for (const { riconosciuta, ...g } of gruppi.values()) {
    // Un solo episodio di una serie non riconosciuta resta un video qualunque.
    if (!riconosciuta && g.ids.length < 2) sciolti.push(...g.ids)
    else serie.push(g)
  }
  return { sciolti, serie }
}
