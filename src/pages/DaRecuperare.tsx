import { useCallback, useEffect, useMemo, useState } from 'react'
import PageHeader from '../components/PageHeader'
import MediaGrid from '../components/MediaGrid'
import { EmptyState, ErrorState, Loader } from '../components/States'
import { FilterBar, FilterGroup, ChipGroup, filterSelectClass } from '../components/FilterBar'
import { useAuth } from '../lib/auth'
import { listAll } from '../lib/userTitles'
import { discoverMigliori } from '../lib/tmdb'
import { logFailure } from '../lib/logFailure'
import {
  chiaviConosciute,
  generiPreferiti,
  intervalloDecennio,
  raccogliNonVisti,
} from '../lib/daRecuperare'
import type { MediaItem, TmdbType, UserTitle } from '../lib/types'

type Ambito = 'tutti' | 'miei'
const AMBITI: { value: Ambito; label: string }[] = [
  { value: 'tutti', label: 'Tutti i generi' },
  { value: 'miei', label: 'I generi che guardo' },
]

const TIPI: { value: TmdbType; label: string }[] = [
  { value: 'movie', label: 'Film' },
  { value: 'tv', label: 'Serie TV' },
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

  const [tipo, setTipo] = useState<TmdbType>('movie')
  const [ambito, setAmbito] = useState<Ambito>('tutti')
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

  const conosciute = useMemo(() => chiaviConosciute(collezione), [collezione])
  const mieiGeneri = useMemo(() => generiPreferiti(collezione), [collezione])

  const filtri = useMemo(() => {
    const intervallo = decennio === 'all' ? {} : intervalloDecennio(decennio)
    return {
      votiMinimi,
      genreIds: ambito === 'miei' ? mieiGeneri : [],
      ...intervallo,
    }
  }, [ambito, mieiGeneri, decennio, votiMinimi])

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
    raccogliNonVisti(carica, conosciute)
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
  }, [carica, conosciute, collezioneLetta])

  async function caricaAltri() {
    if (prossima === null) return
    setAncora(true)
    try {
      const { items: nuovi, prossimaPagina } = await raccogliNonVisti(carica, conosciute, {
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

  const senzaGeneriPropri = ambito === 'miei' && mieiGeneri.length === 0

  return (
    <div>
      <PageHeader
        eyebrow="Da recuperare"
        title="I più belli che ti mancano"
        subtitle="I titoli col voto più alto su TMDB, meno tutto quello che hai già in archivio."
      />

      <FilterBar>
        <FilterGroup label="Tipo">
          <ChipGroup options={TIPI} value={tipo} onChange={setTipo} />
        </FilterGroup>
        <FilterGroup label="Ambito">
          <ChipGroup options={AMBITI} value={ambito} onChange={setAmbito} />
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
