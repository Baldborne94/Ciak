import { AI_DAILY_LIMIT } from '../lib/aiQuota'
import { useAiCreditsLeft } from '../lib/useAiCredits'

// Riga "usi AI rimasti oggi", mostrata in modo coerente su tutte le funzioni
// AI (canzone, foto, ordine-trama delle saghe).
export default function AiCreditsNote({
  extra,
  className = '',
}: {
  extra?: string
  className?: string
}) {
  const left = useAiCreditsLeft()
  return (
    <p className={`text-xs text-zinc-500 ${className}`}>
      🤖 Usi AI rimasti oggi: <span className="text-projector">{left}</span>/{AI_DAILY_LIMIT}
      {extra ? ` · ${extra}` : ''}
    </p>
  )
}
