import { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth'
import { leggiSchema, messaggioSchema, type EsitoSchema } from '../lib/schemaVersion'

// Avvisa quando il database è rimasto indietro rispetto al codice. Serve a
// trasformare un guasto muto — «premo Salva e non succede niente» — in una
// frase che dice cosa manca e come rimediare.
//
// Solo per chi ha fatto l'accesso: è chi scrive che può incontrare l'errore, e
// a un visitatore di passaggio (una lista pubblica, una condivisione) la
// versione dello schema non dice nulla.
export default function SchemaBanner() {
  const { user } = useAuth()
  const [esito, setEsito] = useState<EsitoSchema | null>(null)

  useEffect(() => {
    if (!user) {
      setEsito(null)
      return
    }
    let annullato = false
    // Una sola lettura per sessione di login: la versione dello schema non
    // cambia mentre l'utente naviga.
    leggiSchema().then((r) => {
      if (!annullato) setEsito(r)
    })
    return () => {
      annullato = true
    }
  }, [user])

  if (!esito || esito.stato === 'ok') return null

  return (
    <div role="status" className="border-b border-amber-500/40 bg-amber-500/10">
      <div className="container-cine flex items-start gap-3 py-3 text-sm text-amber-200">
        <span aria-hidden="true">⚠️</span>
        <p>
          <span className="font-semibold">Database da aggiornare.</span>{' '}
          {messaggioSchema(esito)}
        </p>
      </div>
    </div>
  )
}
