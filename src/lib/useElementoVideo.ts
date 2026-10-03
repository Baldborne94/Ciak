import { useEffect, useState, type RefObject } from 'react'

// L'elemento <video> dietro un ref, come stato: chi deve ascoltarne gli eventi
// si riaggancia quando cambia. Il <video> può arrivare dopo la pagina (prima
// c'è l'anteprima di Drive) e si rifà a ogni episodio; agganciato una volta
// sola all'apertura, quando ancora non c'era, non si sapeva mai che il film
// andava.
export function useElementoVideo(videoRef: RefObject<HTMLVideoElement>): HTMLVideoElement | null {
  const [video, setVideo] = useState<HTMLVideoElement | null>(null)
  // Senza dipendenze apposta: un ref che cambia non ridisegna niente. Non è
  // un giro infinito, perché si aggiorna solo quando l'elemento è cambiato.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (videoRef.current !== video) setVideo(videoRef.current)
  })
  return video
}
