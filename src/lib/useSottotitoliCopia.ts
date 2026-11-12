import { useEffect, useMemo } from 'react'
import { salvaSottotitoliOffline, type FilmOffline } from './filmOffline'
import { logFailure } from './logFailure'
import type { Traccia } from './useSottotitoli'

// I sottotitoli della copia salvata in Ciak, per il lettore.
//
// `usaSalvati`: si guarda la copia (niente disco, niente server di casa), e
// i sottotitoli sono quelli salvati con lei, pronti come tracce del lettore.
// Altrimenti quelli trovati ora (dopo il salvataggio, o cambiati con «Prova
// un altro») raggiungono la sua scheda: offline si vedono quelli.
export function useSottotitoliCopia(fileId: string, locale: FilmOffline | null | undefined, usaSalvati: boolean, trovati: Traccia[]) {
  const salvati = usaSalvati ? locale?.sottotitoli : undefined
  const tracce = useMemo(
    () =>
      (salvati ?? []).map((s) => ({
        ...s,
        url: URL.createObjectURL(new Blob([s.vtt], { type: 'text/vtt' })),
      })),
    [salvati],
  )
  useEffect(() => () => tracce.forEach((t) => URL.revokeObjectURL(t.url)), [tracce])

  useEffect(() => {
    if (!locale || usaSalvati || trovati.length === 0) return
    void salvaSottotitoliOffline(
      fileId,
      trovati.map(({ chiave, lingua, etichetta, vtt }) => ({ chiave, lingua, etichetta, vtt })),
    ).catch(logFailure('Sottotitoli nella scheda del film offline'))
  }, [fileId, locale, usaSalvati, trovati])

  return tracce
}
