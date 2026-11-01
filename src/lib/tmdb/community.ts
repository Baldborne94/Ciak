import { tmdbFetch } from './client'
import { normalise, type RawMedia } from './raw'
import { patchReadableTitles } from './titles'
import type { MediaItem, TmdbType } from '../types'

// Ciò che gli altri spettatori dicono e raccolgono su TMDB: le recensioni e le
// liste pubbliche. È la parte «sociale» che si cercava su Letterboxd, che però
// non ha un'API pubblica: TMDB ce l'ha, ed è già la fonte del catalogo.

export interface Recensione {
  id: string
  autore: string
  // Il voto dell'autore, da 1 a 10 come su TMDB; null se non l'ha dato.
  voto: number | null
  testo: string
  data: string
  url: string
  lingua: string | null
}

interface RawRecensione {
  id: string
  author: string
  author_details?: { name?: string; username?: string; rating?: number | null }
  content: string
  created_at: string
  url: string
  iso_639_1?: string
}

// Le recensioni in italiano prima, poi le altre; dentro, dalla più recente.
export function ordinaRecensioni(gruppi: RawRecensione[][]): Recensione[] {
  const viste = new Map<string, Recensione>()
  for (const r of gruppi.flat()) {
    if (viste.has(r.id) || !r.content?.trim()) continue
    viste.set(r.id, {
      id: r.id,
      autore: r.author_details?.name || r.author || r.author_details?.username || 'Anonimo',
      voto: typeof r.author_details?.rating === 'number' ? r.author_details.rating : null,
      testo: r.content.trim(),
      data: r.created_at,
      url: r.url,
      lingua: r.iso_639_1 ?? null,
    })
  }
  return [...viste.values()].sort((a, b) => Number(b.lingua === 'it') - Number(a.lingua === 'it') || b.data.localeCompare(a.data))
}

export async function getRecensioni(type: TmdbType, id: number): Promise<Recensione[]> {
  // TMDB divide le recensioni per lingua: senza chiederle anche in inglese, si
  // vedrebbero solo le poche in italiano.
  const [it, en] = await Promise.all(
    (['it-IT', 'en-US'] as const).map((language) =>
      tmdbFetch<{ results?: RawRecensione[] }>(`/${type}/${id}/reviews`, { language }).then((d) => d.results ?? []),
    ),
  )
  return ordinaRecensioni([it, en])
}

export interface ListaUtente {
  id: number
  nome: string
  descrizione: string
  quanti: number
  preferiti: number
  posterPath: string | null
}

interface RawLista {
  id: number
  name: string
  description?: string
  item_count?: number
  favorite_count?: number
  poster_path?: string | null
}

// Le liste più seguite prima: fra centinaia di «watchlist» personali, quelle
// che altri hanno messo fra i preferiti sono le più curate.
export function ordinaListe(gruppi: RawLista[][]): ListaUtente[] {
  const viste = new Map<number, ListaUtente>()
  for (const l of gruppi.flat()) {
    if (viste.has(l.id) || !l.name?.trim() || (l.item_count ?? 0) < 2) continue
    viste.set(l.id, {
      id: l.id,
      nome: l.name.trim(),
      descrizione: (l.description ?? '').trim(),
      quanti: l.item_count ?? 0,
      preferiti: l.favorite_count ?? 0,
      posterPath: l.poster_path ?? null,
    })
  }
  return [...viste.values()].sort((a, b) => b.preferiti - a.preferiti || b.quanti - a.quanti)
}

// Le liste pubbliche che contengono un titolo, in italiano e in inglese.
export async function getListeConTitolo(type: TmdbType, id: number): Promise<ListaUtente[]> {
  const [it, en] = await Promise.all(
    (['it-IT', 'en-US'] as const).map((language) =>
      tmdbFetch<{ results?: RawLista[] }>(`/${type}/${id}/lists`, { language }).then((d) => d.results ?? []),
    ),
  )
  return ordinaListe([it, en])
}

export interface ListaTmdb {
  nome: string
  descrizione: string
  autore: string | null
  quanti: number
  titoli: MediaItem[]
  pagine: number
}

// Una lista pubblica di TMDB, una pagina alla volta (TMDB ne manda 20 titoli).
export async function getListaTmdb(id: number, page = 1): Promise<ListaTmdb> {
  const [data, en] = await Promise.all([
    tmdbFetch<{ name: string; description?: string; created_by?: string; item_count?: number; items?: RawMedia[]; total_pages?: number }>(`/list/${id}`, {
      page: String(page),
    }),
    tmdbFetch<{ items?: RawMedia[] }>(`/list/${id}`, { page: String(page), language: 'en-US' }),
  ])
  // Una lista mescola film e serie, e gli id TMDB sono unici solo dentro un
  // tipo: i titoli inglesi si abbinano tipo per tipo.
  for (const tipo of ['movie', 'tv'] as const) {
    patchReadableTitles((data.items ?? []).filter((r) => r.media_type === tipo), (en.items ?? []).filter((r) => r.media_type === tipo))
  }
  return {
    nome: data.name,
    descrizione: (data.description ?? '').trim(),
    autore: data.created_by || null,
    quanti: data.item_count ?? (data.items ?? []).length,
    titoli: (data.items ?? []).filter((r) => r.media_type === 'movie' || r.media_type === 'tv').map((r) => normalise(r)),
    pagine: data.total_pages ?? 1,
  }
}
