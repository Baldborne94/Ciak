// Le funzioni di api/, col nome con cui il browser le chiama (/api/<nome>).
// Una funzione nuova in api/ si aggiunge qui: lo controlla funzioni.test.ts.

import checkReleases from '../api/check-releases'
import identify from '../api/identify'
import sagaOrder from '../api/saga-order'
import sigle from '../api/sigle'
import songFilms from '../api/song-films'
import sottotitoli from '../api/sottotitoli'
import tmdb from '../api/tmdb'
import tonight from '../api/tonight'
import type { Funzione } from './ciak'

export const funzioni: Record<string, Funzione> = {
  'check-releases': checkReleases as Funzione,
  identify: identify as Funzione,
  'saga-order': sagaOrder as Funzione,
  sigle: sigle as Funzione,
  'song-films': songFilms as Funzione,
  sottotitoli: sottotitoli as Funzione,
  tmdb: tmdb as Funzione,
  tonight: tonight as Funzione,
}
