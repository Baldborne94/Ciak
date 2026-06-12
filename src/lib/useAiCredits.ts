import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useAuth } from './auth'
import { aiUsesLeft, AI_DAILY_LIMIT, setAiCreditsLeft } from './aiQuota'

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10)
}

// Quanti usi AI restano oggi. Legge il valore noto in locale a ogni render
// (così si aggiorna dopo ogni chiamata AI) e, al mount, lo riallinea col
// contatore reale su Supabase (tabella ai_usage). Se la tabella non esiste
// ancora o l'utente non è loggato, resta il valore locale.
export function useAiCreditsLeft(): number {
  const { user } = useAuth()
  const [, force] = useState(0)

  useEffect(() => {
    if (!user || !supabase) return
    let active = true
    supabase
      .from('ai_usage')
      .select('count')
      .eq('user_id', user.id)
      .eq('day', todayUtc())
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return
        const used = (data as { count: number } | null)?.count ?? 0
        setAiCreditsLeft(Math.max(0, AI_DAILY_LIMIT - used))
        force((n) => n + 1)
      })
    return () => {
      active = false
    }
  }, [user])

  return aiUsesLeft()
}
