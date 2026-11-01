import { useCallback, useEffect, useMemo, useState } from 'react'
import PageHeader from '../components/PageHeader'
import MediaGrid from '../components/MediaGrid'
import { EmptyState, ErrorState, Loader } from '../components/States'
import { FilterBar, FilterGroup, ChipGroup, filterSelectClass } from '../components/FilterBar'
import { useAuth } from '../lib/auth'
import { listAll } from '../lib/userTitles'
import { discoverMigliori, getGenres, type FiltriMigliori } from '../lib/tmdb'
import { logFailure } from '../lib/logFailure'
import {
  chiaviConosciute,
  generiPreferiti,
  intervalloDecennio,
  raccogliNonVisti,
} from '../lib/daRecuperare'
import type { Genre, MediaItem, TmdbType, UserTitle } from '../lib/types'

// Il genere: tutti, i tre che frequenti di più, o uno scelto dall'elenco di TMDB.
type Genere = 'tutti' | 'miei' | number

// «Che mi mancano» toglie l'archivio; «Classifica completa» è la classifica di
// tutti, coi già visti segnati dal loro badge: serve a vedere a che punto sei,
// non solo cosa resta.
type Mostra = 'mancano' | 'tutti'
const MOSTRA: { value: Mostra; label: string }[] = [
  { value: 'mancano', label: 'Che mi mancano' },
  { value: 'tutti', label: 'Classifica completa' },
]
const NESSUNA = new Set<string>()

// Cosa si classifica. Anime e cartoni sono serie animate distinte dalla lingua
// originale, come nella ricerca; i film d'animazione (Ghibli, Pixar) sono film.
type Categoria = 'movie' | 'tv' | 'animazione' | 'anime' | 'cartoni'
const CATEGORIE: { value: Categoria; label: string; tipo: TmdbType; filtri: Pick<FiltriMigliori, 'animazione' | 'lingua'> }[] = [
  { value: 'movie', label: 'Film', tipo: 'movie', filtri: {} },
  { value: 'tv', label: 'Serie TV', tipo: 'tv', filtri: {} },
  { value: 'animazione', label: 'Film d’animazione', tipo: 'movie', filtri: { animazione: true } },
  { value: 'anime', label: 'Anime', tipo: 'tv', filtri: { animazione: true, lingua: 'ja' } },
  { value: 'cartoni', label: 'Cartoni', tipo: 'tv', filtri: { animazione: true, lingua: 'en' } },
]

// Quanti voti servono perché un titolo conti. Ordinando per voto medio senza
// una soglia, in cima finiscono i film con nove voti a dieci: cortometraggi
// sconosciuti, non capolavori. Più alta la soglia, più il risultato somiglia
// a un canone condiviso; più bassa, più si scende nel poco battuto.
const SOGLIE = [
  { value: 3000, label: 'Solo i celebrati' },
  { value: 1000, label: 'Equilibrata' },
  { value: 300, label: 'Anche i meno noti' },
]

const DECENNI = [2020, 2010, 2000, 1990, 1980, 1970, 1960, 1950]

export default function DaRecuperare() {
  const { user } = useAuth()
  const [collezione, setCollezione] = useState<UserTitle[]>([])
  // Separato da `collezione.length`: una collezione vuota è uno stato
  // legittimo (archivio appena iniziato), e confonderlo con «non ancora letta»
  // lasciava la pagina in caricamento per sempre.
  const [collezioneLetta, setCollezioneLetta] = useState(false)
  const [items, setItems] = useState<MediaItem[]>([])
  const [prossima, setProssima] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [ancora, setAncora] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [categoria, setCategoria] = useState<Categoria>('movie')
  const scelta = CATEGORIE.find((c) => c.value === categoria) ?? CATEGORIE[0]
  const tipo = scelta.tipo
  const [mostra, setMostra] = useState<Mostra>('mancano')
  const [genere, setGenere] = useState<Genere>('tutti')
  const [generi, setGeneri] = useState<Genre[]>([])
  const [decennio, setDecennio] = useState<number | 'all'>('all')
  const [votiMinimi, setVotiMinimi] = useState(1000)

  useEffect(() => {
    if (!user) {
      setCollezione([])
      setCollezioneLetta(true)
      return
    }
    setCollezioneLetta(false)
    listAll(user.id)
      .then(setCollezione)
      .catch(logFailure('collezione non letta per i recuperi'))
      // Anche se la lettura fallisce si prosegue: meglio i suggerimenti senza
      // la sottrazione che nessun suggerimento.
      .finally(() => setCollezioneLetta(true))
  }, [user])

  // I generi di film e di serie hanno id diversi: cambiando tipo, uno scelto
  // dall'elenco dell'altro non vale più e si torna a «Tutti».
  useEffect(() => {
    let vivo = true
    getGenres(tipo)
      .then((g) => {
        if (!vivo) return
        setGeneri(g)
        setGenere((prima) => (typeof prima === 'number' && !g.some((x) => x.id === prima) ? 'tutti' : prima))
      })
      .catch(logFailure('generi per «Da recuperare»'))
    return () => {
      vivo = false
    }
  }, [tipo])

  const conosciute = useMemo(() => chiaviConosciute(collezione), [collezione])
  const escluse = mostra === 'mancano' ? conosciute : NESSUNA
  const mieiGeneri = useMemo(() => generiPreferiti(collezione), [collezione])

  const filtri = useMemo(() => {
    const intervallo = decennio === 'all' ? {} : intervalloDecennio(decennio)
    return {
      votiMinimi,
      genreIds: genere === 'miei' ? mieiGeneri : genere === 'tutti' ? [] : [genere],
      ...intervallo,
      ...scelta.filtri,
    }
  }, [genere, mieiGeneri, decennio, votiMinimi, scelta])

  const carica = useCallback(
    (page: number) => discoverMigliori(tipo, filtri, page),
    [tipo, filtri],
  )

  // Prima schermata (e ricarica a ogni cambio di filtro).
  useEffect(() => {
    // Si aspetta di aver LETTO la collezione, non che contenga qualcosa:
    // altrimenti la prima schermata mostrerebbe film già visti per poi
    // rimuoverli sotto gli occhi.
    if (!collezioneLetta) return
    let annullato = false
    setLoading(true)
    setError(null)
    raccogliNonVisti(carica, escluse)
      .then(({ items: trovati, prossimaPagina }) => {
        if (annullato) return
        setItems(trovati)
        setProssima(prossimaPagina)
      })
      .catch((e: Error) => {
        if (!annullato) setError(e.message)
      })
      .finally(() => {
        if (!annullato) setLoading(false)
      })
    return () => {
      annullato = true
    }
  }, [carica, escluse, collezioneLetta])

  async function caricaAltri() {
    if (prossima === null) return
    setAncora(true)
    try {
      const { items: nuovi, prossimaPagina } = await raccogliNonVisti(carica, escluse, {
        da: prossima,
      })
      setItems((prev) => [...prev, ...nuovi])
      setProssima(prossimaPagina)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setAncora(false)
    }
  }

  const senzaGeneriPropri = genere === 'miei' && mieiGeneri.length === 0

  return (
    <div>
      <PageHeader
        eyebrow="Da recuperare"
        title={mostra === 'mancano' ? 'I più belli che ti mancano' : 'I più belli di sempre'}
        subtitle={
          mostra === 'mancano'
            ? 'I titoli col voto più alto su TMDB, meno tutto quello che hai già in archivio.'
            : 'La classifica completa del pubblico di TMDB: quelli che hai già portano il loro segno.'
        }
      />

      <FilterBar>
        <FilterGroup label="Tipo">
          <ChipGroup options={CATEGORIE} value={categoria} onChange={setCategoria} />
        </FilterGroup>
        <FilterGroup label="Mostra">
          <ChipGroup options={MOSTRA} value={mostra} onChange={setMostra} />
        </FilterGroup>
        <FilterGroup label="Genere">
          <select
            aria-label="Genere"
            value={String(genere)}
            onChange={(e) => {
              const v = e.target.value
              setGenere(v === 'tutti' || v === 'miei' ? v : Number(v))
            }}
            className={filterSelectClass}
          >
            <option value="tutti">Tutti i generi</option>
            <option value="miei">I generi che guardo</option>
            {generi.filter((g) => !(scelta.filtri.animazione && g.id === 16)).map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </FilterGroup>
        <FilterGroup label="Decennio">
          <select
            aria-label="Decennio"
            value={decennio}
            onChange={(e) => setDecennio(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            className={filterSelectClass}
          >
            <option value="all">Tutti</option>
            {DECENNI.map((d) => (
              <option key={d} value={d}>Anni {String(d).slice(2)}</option>
            ))}
          </select>
        </FilterGroup>
        <FilterGroup label="Selezione">
          <select
            aria-label="Selezione"
            value={votiMinimi}
            onChange={(e) => setVotiMinimi(Number(e.target.value))}
            className={filterSelectClass}
          >
            {SOGLIE.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </FilterGroup>
      </FilterBar>

      {senzaGeneriPropri ? (
        <EmptyState
          icon="🎭"
          title="Non so ancora cosa guardi"
          message="Segna qualche titolo come visto — o completa i generi dalle Impostazioni — e potrò restringere ai generi che frequenti."
        />
      ) : loading ? (
        <Loader label="Cerco quelli che ti mancano…" />
      ) : error ? (
        <ErrorState title="Suggerimenti non disponibili" message={error} />
      ) : items.length === 0 && mostra === 'tutti' ? (
        <EmptyState icon="🔎" title="Nessun titolo" message="Con questi filtri TMDB non ha niente da classificare. Prova un altro genere o un altro decennio." />
      ) : items.length === 0 ? (
        <EmptyState
          icon="🏆"
          title="Li hai visti tutti"
          message="Con questi filtri non è rimasto niente che tu non abbia già in archivio. Prova un altro decennio, o allarga la selezione ai meno noti."
        />
      ) : (
        <>
          <MediaGrid items={items} />
          {prossima !== null && (
            <div className="mt-8 flex justify-center">
              <button onClick={caricaAltri} disabled={ancora} className="btn-ghost">
                {ancora ? 'Cerco…' : 'Carica altri'}
              </button>
            </div>
          )}
          <p className="mt-8 text-center text-xs text-zinc-500">
            I voti sono quelli del pubblico di TMDB, non di una giuria: premiano il consenso, e
            i film molto amati da pochi restano indietro. La soglia «Anche i meno noti» serve a
            scendere sotto quel livello.
          </p>
        </>
      )}
    </div>
  )
}
