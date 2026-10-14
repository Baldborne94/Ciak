import { useCallback, useState } from 'react'
import {
  indiceSottotitolo,
  leggiDimensioneSottotitoli,
  leggiLinguaSottotitoli,
  linguaTraccia,
  nomiSottotitoli,
  salvaDimensioneSottotitoli,
  salvaLinguaSottotitoli,
  siglaSottotitolo,
  type TracciaConLingua,
} from './sceltaSottotitoli'

// Quale sottotitolo si vede (-1: nessuno) e quanto grande: spenti finché non
// se ne sceglie uno dal CC, poi la stessa lingua anche negli episodi e nei
// film dopo (vedi lib/sceltaSottotitoli).
export function useSceltaSottotitoli(tracce: TracciaConLingua[]) {
  const [lingua, setLingua] = useState(leggiLinguaSottotitoli)
  const [toccato, setToccato] = useState<number | null>(null)
  const scelto = indiceSottotitolo(tracce, lingua, toccato)
  const scegli = useCallback(
    (indice: number) => {
      const nuova = indice < 0 || !tracce[indice] ? null : linguaTraccia(tracce[indice])
      setLingua(nuova)
      setToccato(indice < 0 ? null : indice)
      salvaLinguaSottotitoli(nuova)
    },
    [tracce],
  )
  const [dimensione, setDimensione] = useState(leggiDimensioneSottotitoli)
  const cambiaDimensione = useCallback((i: number) => {
    setDimensione(i)
    salvaDimensioneSottotitoli(i)
  }, [])
  return {
    scelto,
    scegli,
    // Il pulsante CC (e il tasto C) passa al sottotitolo dopo, e dall'ultimo a nessuno.
    prossimo: scelto + 1 >= tracce.length ? -1 : scelto + 1,
    nomi: nomiSottotitoli(tracce),
    sigla: siglaSottotitolo(tracce, scelto),
    dimensione,
    cambiaDimensione,
  }
}
