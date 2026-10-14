import { useState } from 'react'
import Modal from './Modal'
import ModificaSaga from './ModificaSaga'
import SceltaCopertina from './SceltaCopertina'
import { aggiornaCopertina, creaSaga, deleteList, modificaSaga } from '../lib/lists'
import { filmDelloStudio } from '../lib/perStudio'
import type { Raccolta } from '../lib/raccolte'
import type { VideotecaComposta } from '../lib/elencoVideoteca'
import type { VoceStreaming } from '../lib/streaming'
import { logFailure } from '../lib/logFailure'

// La saga fatta a mano che si sta creando (listaId null) o cambiando.
// `daTmdb`: una saga di TMDB da cambiare, che diventa una fatta a mano.
export interface SagaInModifica {
  listaId: string | null
  daTmdb?: { id: number; nome: string; chiavi: Set<string> }
}

// Le finestre delle saghe della videoteca: comporre o cambiare una saga fatta
// a mano (una lista segnata come saga, coi film scelti) e sceglierne la
// copertina.
export default function ModaliSaghe({
  userId,
  inModifica,
  onChiudiModifica,
  copertinaDi,
  onChiudiCopertina,
  raccolte,
  onCopertina,
  ricaricaRaccolte,
  composta,
  archivio,
  onErrore,
}: {
  userId: string | null
  inModifica: SagaInModifica | null
  onChiudiModifica: () => void
  // La saga fatta a mano di cui si sta scegliendo la copertina.
  copertinaDi: string | null
  onChiudiCopertina: () => void
  raccolte: Raccolta[]
  onCopertina: (listId: string, copertina: string | null) => void
  ricaricaRaccolte: () => Promise<void>
  composta: VideotecaComposta
  archivio: Map<string, VoceStreaming>
  onErrore: (messaggio: string) => void
}) {
  const [salvando, setSalvando] = useState(false)
  const { filmPerSaga, inSagaTmdb, posterDi, film, chiaveTitolo, serieGruppi } = composta

  // Una saga nuova serve per i film che TMDB non mette già in una saga: quelli
  // che stanno in una sua cartella non si propongono (quella saga c'è già, e
  // si cambia con «✎ Modifica la saga»). Cambiando una saga esistente si
  // sceglie fra tutti.
  const sceglibili =
    inModifica && !inModifica.listaId && !inModifica.daTmdb ? filmPerSaga.filter((f) => !inSagaTmdb.has(f.chiave)) : filmPerSaga
  const listaAperta = inModifica?.listaId ? (raccolte.find((r) => r.id === inModifica.listaId) ?? null) : null

  // Si toccano solo i film che qui si possono scegliere: quelli della lista che
  // non sono nella videoteca, o che stanno in un'altra scheda, restano dove sono.
  async function salva(nome: string, chiavi: string[]) {
    if (!userId || !inModifica) return
    const perChiave = new Map(sceglibili.map((f) => [f.chiave, f]))
    const ref = (k: string) => {
      const f = perChiave.get(k)
      const tv = k.startsWith('tv-')
      return { tmdbId: Number(k.slice(k.indexOf('-') + 1)), mediaType: tv ? ('tv' as const) : ('movie' as const), title: f?.titolo ?? k, posterPath: posterDi.get(k) ?? null }
    }
    setSalvando(true)
    try {
      if (!inModifica.listaId) {
        await creaSaga(userId, nome, chiavi.map(ref), inModifica.daTmdb?.id ?? null)
      } else {
        const lista = raccolte.find((r) => r.id === inModifica.listaId)
        const prima = lista?.chiavi ?? new Set<string>()
        const togli = [...prima].filter((k) => perChiave.has(k) && !chiavi.includes(k)).flatMap((k) => lista?.voci.get(k) ?? [])
        await modificaSaga(userId, inModifica.listaId, nome, chiavi.filter((k) => !prima.has(k)).map(ref), togli)
      }
      await ricaricaRaccolte()
      onChiudiModifica()
    } catch (e) {
      const messaggio = (e as Error).message
      onErrore(
        /come_saga/.test(messaggio)
          ? 'Per le saghe fatte a mano il database va aggiornato: esegui supabase/schema_v21_saghe_manuali.sql nel SQL Editor di Supabase.'
          : /saga_tmdb/.test(messaggio)
            ? 'Per modificare le saghe di TMDB il database va aggiornato: esegui supabase/schema_v22_saghe_tmdb_modificate.sql nel SQL Editor di Supabase.'
            : `Saga non salvata: ${messaggio}`,
      )
      onChiudiModifica()
      logFailure('Saga fatta a mano')(e)
    } finally {
      setSalvando(false)
    }
  }

  // Sciogliere una saga toglie solo la lista: i file restano, e ogni film
  // torna al suo posto nell'elenco.
  async function sciogli(listaId: string, nome: string) {
    if (!window.confirm(`Vuoi sciogliere la saga «${nome}»?\nI film restano nella cartella e tornano al loro posto nell'elenco.`)) return
    try {
      await deleteList(listaId)
      await ricaricaRaccolte()
      onChiudiModifica()
    } catch (e) {
      onErrore(`Saga non sciolta: ${(e as Error).message}`)
      logFailure('Saga fatta a mano')(e)
    }
  }

  async function scegliCopertina(listId: string, copertina: string | null) {
    try {
      await aggiornaCopertina(listId, copertina)
      onCopertina(listId, copertina)
      onChiudiCopertina()
    } catch (e) {
      onErrore(`Copertina non salvata: ${(e as Error).message}`)
      onChiudiCopertina()
      logFailure('Copertina della saga')(e)
    }
  }

  // La copertina di una saga fatta a mano: le immagini sono quelle dei suoi film.
  const listaCopertina = raccolte.find((r) => r.id === copertinaDi) ?? null
  const perCopertina = listaCopertina
    ? {
        raccolta: listaCopertina,
        film: film.filter((f) => {
          const k = chiaveTitolo(f.riga.id)
          return k !== null && listaCopertina.chiavi.has(k)
        }),
        serie: serieGruppi.filter((g) => !!g.tmdb && listaCopertina.chiavi.has(g.tmdb)),
      }
    : null

  return (
    <>
      {inModifica && (
        <Modal
          title={listaAperta ? `Saga «${listaAperta.nome}»` : inModifica.daTmdb ? `Saga «${inModifica.daTmdb.nome}»` : 'Crea una saga'}
          onClose={onChiudiModifica}
        >
          {!listaAperta && !inModifica.daTmdb && inSagaTmdb.size > 0 && (
            <p className="mb-3 text-sm text-zinc-400">
              I film che TMDB mette già in una saga (Alien, Harry Potter…) non compaiono: quella saga c’è già nell’elenco, e si cambia con «✎
              Modifica la saga».
            </p>
          )}
          <ModificaSaga
            film={sceglibili}
            // Scelti in partenza solo i titoli che qui si vedono: gli altri della
            // lista non si toccano, e non vanno contati.
            iniziale={
              listaAperta
                ? { nome: listaAperta.nome, chiavi: new Set(sceglibili.map((f) => f.chiave).filter((k) => listaAperta.chiavi.has(k))) }
                : inModifica.daTmdb
                  ? { nome: inModifica.daTmdb.nome, chiavi: inModifica.daTmdb.chiavi }
                  : undefined
            }
            onSalva={(nome, chiavi) => void salva(nome, chiavi)}
            onCercaStudio={(nome) => filmDelloStudio(nome)}
            onSciogli={listaAperta ? () => void sciogli(listaAperta.id, listaAperta.nome) : undefined}
            salvando={salvando}
          />
        </Modal>
      )}
      {perCopertina && (
        <Modal title={`Copertina di «${perCopertina.raccolta.nome}»`} onClose={onChiudiCopertina}>
          <SceltaCopertina
            titoli={[
              ...perCopertina.film.flatMap((f) => {
                const voce = archivio.get(f.video.id)
                return voce?.tmdb_id ? [{ tmdbId: voce.tmdb_id, mediaType: 'movie' as const, titolo: f.riga.nome }] : []
              }),
              ...perCopertina.serie.flatMap((g) =>
                g.tmdb.startsWith('tv-') ? [{ tmdbId: Number(g.tmdb.slice(3)), mediaType: 'tv' as const, titolo: g.titolo }] : [],
              ),
            ]}
            attuale={perCopertina.raccolta.copertina}
            onScegli={(c) => void scegliCopertina(perCopertina.raccolta.id, c)}
          />
        </Modal>
      )}
    </>
  )
}
