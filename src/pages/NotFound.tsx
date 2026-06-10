import { Link } from 'react-router-dom'
import EmptyState from '@/components/EmptyState'

export default function NotFound() {
  return (
    <EmptyState
      icon="🎬"
      title="Scena tagliata al montaggio"
      message="La pagina che cerchi non esiste o è finita sul pavimento della sala montaggio."
    >
      <Link to="/" className="btn-gold mt-2">
        ← Torna in sala
      </Link>
    </EmptyState>
  )
}
