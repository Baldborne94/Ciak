import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import MediaGrid from '../components/MediaGrid'
import { EmptyState, ErrorState, Loader } from '../components/States'
import { getListaTmdb, type ListaTmdb } from '../lib/tmdb'
import { logFailure } from '../lib/logFailure'
import type { MediaItem } from '../lib/types'

// Una lista pubblica di un utente di TMDB, aperta dalla scheda di un titolo
// («Nelle liste degli utenti»). Si sfoglia come il catalogo: l'ordine è quello
// scelto da chi l'ha fatta, e «Carica altri» accoda le pagine senza riordinare.
export default function ListaTmdbPage() {
  const { id } = useParams<{ id: string }>()
  const [lista, setLista] = useState<ListaTmdb | null>(null)
  const [titoli, setTitoli] = useState<MediaItem[]>([])
  const [pagina, setPagina] = useState(1)
  const [errore, setErrore] = useState<string | null>(null)
  const [ancora, setAncora] = useState(false)

  useEffect(() => {
    if (!id) return
    let vivo = true
    setLista(null)
    setTitoli([])
    setPagina(1)
    setErrore(null)
    getListaTmdb(Number(id))
      .then((l) => {
        if (!vivo) return
        setLista(l)
        setTitoli(l.titoli)
      })
      .catch((e: Error) => vivo && setErrore(e.message))
    return () => {
      vivo = false
    }
  }, [id])

  async function caricaAltri() {
    if (!id) return
    setAncora(true)
    try {
      const l = await getListaTmdb(Number(id), pagina + 1)
      // Un titolo ripetuto fra due pagine comparirebbe due volte nella griglia.
      setTitoli((prima) => {
        const gia = new Set(prima.map((t) => `${t.mediaType}-${t.id}`))
        return [...prima, ...l.titoli.filter((t) => !gia.has(`${t.mediaType}-${t.id}`))]
      })
      setPagina(pagina + 1)
    } catch (e) {
      logFailure('Pagina successiva di una lista TMDB')(e)
    } finally {
      setAncora(false)
    }
  }

  if (errore) return <ErrorState title="Lista non disponibile" message={errore} />
  if (!lista) return <Loader label="Apro la lista…" />

  return (
    <div>
      <PageHeader
        eyebrow="Lista di un utente di TMDB"
        title={lista.nome}
        subtitle={[lista.autore && `di ${lista.autore}`, `${lista.quanti} titoli`].filter(Boolean).join(' · ')}
      />
      {lista.descrizione && <p className="-mt-4 mb-6 max-w-3xl whitespace-pre-line text-sm text-zinc-400">{lista.descrizione}</p>}
      {titoli.length === 0 ? (
        <EmptyState title="Lista vuota" message="Chi l'ha creata non ci ha ancora messo film o serie." />
      ) : (
        <>
          <MediaGrid items={titoli} />
          {pagina < lista.pagine && (
            <div className="mt-8 flex justify-center">
              <button onClick={caricaAltri} disabled={ancora} className="btn-primary">
                {ancora ? 'Carico…' : 'Carica altri'}
              </button>
            </div>
          )}
        </>
      )}
      <Link to="/search" className="mt-8 inline-block text-sm text-projector/80 hover:text-projector">
        ← Torna alla ricerca
      </Link>
    </div>
  )
}
