import { titoloVideo, type VideoFile } from './fileVideo'
import type { Raccolta } from './raccolte'
import { raggruppaSaghe, unisciSaghe, type GruppoSaga } from './saghe'
import { titoloDaMostrare, type VoceStreaming } from './streaming'
import { posterUrl } from './tmdb'
import type { InfoTitoli } from './useInfoTitoli'
import { raggruppaSerie, serieDaSistemare, sigla, type GruppoSerie, type RigaVideoteca } from './videoteca'

export interface FilmDellElenco {
  riga: RigaVideoteca
  video: VideoFile
}

// Un film fra cui comporre una saga fatta a mano.
export interface FilmPerSaga {
  chiave: string
  titolo: string
  anno: string | null
  poster: string | null
}

// Le righe della videoteca per i video di una scheda, con ciò che serve a
// cercarle e ordinarle. Ogni video è un film o l'episodio di una serie: gli
// episodi si raccolgono sotto la loro serie (`raggruppaSerie`), i film della
// stessa saga in una cartella sola (`raggruppaSaghe`), gli altri film restano
// una riga ciascuno.
export function componiVideoteca(
  mostrati: VideoFile[],
  archivio: Map<string, VoceStreaming>,
  info: InfoTitoli,
  raccolte: Raccolta[],
  // Gli episodi spuntati nel diario delle serie (vedi raggruppaSerie).
  vistiNelDiario: Map<string, string> = new Map(),
) {
  const infoDi = (chiave: string) => ({
    anno: info.anni.get(chiave) ?? null,
    generi: info.generi.get(chiave) ?? [],
    titoli: info.titoli.get(chiave) ?? [],
  })
  const videoPerId = new Map(mostrati.map((v) => [v.id, v]))
  const raggruppati = raggruppaSerie(
    mostrati.map((v) => ({ id: v.id, name: v.name, cartella: v.cartella, serie: v.serie ?? null, voce: archivio.get(v.id) })),
    vistiNelDiario,
  )
  // Le righe dell'elenco: i film e una per serie.
  const film: FilmDellElenco[] = raggruppati.sciolti.map((id) => {
    const v = videoPerId.get(id) as VideoFile
    const voce = archivio.get(id)
    return {
      video: v,
      riga: {
        id,
        nome: (voce && titoloDaMostrare(voce)) ?? titoloVideo(v),
        file: v.name,
        ...infoDi(voce?.tmdb_id && voce.media_type ? `${voce.media_type}-${voce.tmdb_id}` : ''),
        aggiunto: v.aggiunto ?? null,
        guardato: voce && voce.posizione > 0 ? (voce.updated_at ?? null) : null,
        daSistemare: !voce?.tmdb_id || !voce.poster_path,
      },
    }
  })
  // I film della stessa saga (Alien, Harry Potter…) in una cartella sola.
  const chiaveTitolo = (id: string) => {
    const voce = archivio.get(id)
    return voce?.tmdb_id && voce.media_type === 'movie' ? `movie-${voce.tmdb_id}` : null
  }
  const filmPerId = new Map(film.map((f) => [f.riga.id, f]))
  const perSaghe = raggruppaSaghe(
    film.map((f) => ({ id: f.riga.id, chiave: chiaveTitolo(f.riga.id), anno: f.riga.anno })),
    // Le saghe di TMDB e quelle fatte a mano (le liste segnate come saga).
    unisciSaghe(info.saghe, raccolte),
  )
  const voci = perSaghe.sciolti.map((id) => filmPerId.get(id) as FilmDellElenco)
  const saghe = new Map<string, GruppoSaga>(perSaghe.saghe.map((g) => [g.chiave, g]))
  for (const g of perSaghe.saghe) {
    const suoi = g.ids.map((id) => (filmPerId.get(id) as FilmDellElenco).riga)
    const anni = suoi.map((r) => r.anno).filter((a): a is string => !!a)
    voci.push({
      video: (filmPerId.get(g.ids[0]) as FilmDellElenco).video,
      riga: {
        id: g.chiave,
        nome: g.saga.name,
        // Cercando un film della saga si trova la saga, che si apre da sola.
        file: suoi.map((r) => `${r.nome} ${r.file}`).join('\n'),
        anno: anni[0] ?? null,
        generi: [...new Set(suoi.flatMap((r) => r.generi))],
        titoli: suoi.flatMap((r) => r.titoli),
        aggiunto: suoi.map((r) => r.aggiunto ?? '').sort().pop() || null,
        guardato: suoi.map((r) => r.guardato ?? '').sort().pop() || null,
        daSistemare: suoi.some((r) => r.daSistemare),
      },
    })
  }
  const serie = new Map<string, GruppoSerie>(raggruppati.serie.map((g) => [g.chiave, g]))
  for (const g of raggruppati.serie) {
    const video = g.ids.map((id) => videoPerId.get(id) as VideoFile)
    voci.push({
      video: video[0],
      riga: {
        id: g.chiave,
        nome: g.titolo,
        // Si trova anche cercando un episodio, per nome del file o per sigla.
        file: g.episodi.map((e) => `${e.file} ${sigla(e) ?? ''}`).join('\n'),
        ...infoDi(g.tmdb),
        aggiunto: video.map((v) => v.aggiunto ?? '').sort().pop() || null,
        guardato: g.episodi.map((e) => e.guardato ?? '').sort().pop() || null,
        daSistemare: serieDaSistemare(g),
      },
    })
  }

  // I film fra cui comporre una saga: quelli riconosciuti di questa scheda,
  // uno per titolo (due versioni dello stesso film sono un titolo solo).
  const filmPerSaga: FilmPerSaga[] = [
    ...new Map(
      film.flatMap((f) => {
        const k = chiaveTitolo(f.riga.id)
        const voce = archivio.get(f.video.id)
        return k
          ? [[k, { chiave: k, titolo: f.riga.nome, anno: f.riga.anno, poster: voce?.poster_path ? posterUrl(voce.poster_path, 'w185') : null }] as const]
          : []
      }),
    ).values(),
  ].sort((a, b) => a.titolo.localeCompare(b.titolo, 'it'))
  // I film che TMDB mette già in una sua saga.
  const inSagaTmdb = new Set(perSaghe.saghe.filter((g) => !g.saga.listaId).flatMap((g) => g.ids.map(chiaveTitolo)))
  // La locandina da salvare con ogni titolo scelto (percorso TMDB).
  const posterDi = new Map<string, string | null>([
    ...film.flatMap((f) => {
      const k = chiaveTitolo(f.riga.id)
      return k ? [[k, archivio.get(f.video.id)?.poster_path ?? null] as const] : []
    }),
    ...raggruppati.serie.map((g) => [g.tmdb, g.posterPath] as const),
  ])

  return {
    infoDi,
    videoPerId,
    film,
    filmPerId,
    chiaveTitolo,
    serie,
    serieGruppi: raggruppati.serie,
    saghe,
    voci,
    filmPerSaga,
    inSagaTmdb,
    posterDi,
  }
}

export type VideotecaComposta = ReturnType<typeof componiVideoteca>
