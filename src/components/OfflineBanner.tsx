import { useCopiaSalvata } from '../lib/offlineState'
import { etichettaCopia } from '../lib/offlineCache'

// Quando l'app serve la collezione salvata invece di quella appena letta, deve
// dirlo. Un archivio che mostra dati vecchi senza avvisare è un archivio di cui
// non ci si può fidare: chi lo guarda non ha modo di sapere se quel «✓ Visto»
// è di oggi o di tre settimane fa.
export default function OfflineBanner() {
  const salvatoIl = useCopiaSalvata()
  if (!salvatoIl) return null

  return (
    <div role="status" className="border-b border-sky-500/40 bg-sky-500/10">
      <div className="container-cine flex items-start gap-3 py-3 text-sm text-sky-200">
        <span aria-hidden="true">📡</span>
        <p>
          <span className="font-semibold">Senza connessione.</span> Stai vedendo la tua collezione{' '}
          {etichettaCopia(salvatoIl)}. Le modifiche fatte adesso non verranno salvate.
        </p>
      </div>
    </div>
  )
}
