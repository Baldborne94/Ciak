// Facciata del catalogo TMDB.
//
// Il file era diventato il modulo-discarica del progetto: 1376 righe con
// dentro ricerca, dettagli, persone, saghe, studi, sottogeneri e la logica dei
// titoli leggibili. Ogni funzione nuova finiva lì perché era comodo, e per
// leggerne una bisognava scorrere tutte le altre.
//
// Ora ognuna di quelle parti sta in `src/lib/tmdb/`. Questo file resta come
// porta d'ingresso: le chiamate sparse nell'app continuano a importare da
// `../lib/tmdb` e non si sono accorte di niente. Chi aggiunge una funzione la
// mette nel modulo giusto e la ri-esporta da qui.
export { tmdbConfigurato } from './tmdb/client'
export { posterUrl, backdropUrl, profileUrl, logoUrl } from './tmdb/images'
export { isReadableTitle, fallbackReadableTitle, displayTitle } from './tmdb/titles'
export { type BrowseSort } from './tmdb/discover'
export {
  getTrending,
  searchMulti,
  getGenres,
  getAnime,
  getPervertitoAnime,
  getCartoons,
  resolveSuggestions,
  getUpcoming,
  resolveKeywordIds,
  discoverByGenre,
  discoverByGenres,
  getRecentReleases,
  type DiscoverFilters,
} from './tmdb/browse'
export {
  fetchTitleFacts,
  fetchGenreIds,
  getDetail,
  getSeason,
  getRecommendations,
} from './tmdb/detail'
export { searchPerson, getPersonDetail, resolvePeople } from './tmdb/people'
export {
  searchCollection,
  getCollection,
  resolveSagas,
  resolveSagaIds,
  getReleaseYears,
  getSagaContinuations,
  getRelatedCollections,
  type SagaContinuation,
} from './tmdb/collections'
export { searchCompany, getCompany, discoverByCompany, resolveStudios } from './tmdb/companies'
