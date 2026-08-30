import { describe, it, expect } from 'vitest'
import { percorsoConsentito, urlTmdb } from './tmdb'

// Questo file esiste soprattutto per la lista dei percorsi: è l'unica cosa che
// separa un proxy verso il nostro catalogo da un proxy verso qualunque cosa.

describe('percorsoConsentito', () => {
  it('accetta i percorsi che l app usa davvero', () => {
    const buoni = [
      '/trending/all/week',
      '/search/multi',
      '/search/keyword',
      '/genre/movie/list',
      '/discover/tv',
      '/movie/550',
      '/tv/1396',
      '/movie/550/recommendations',
      '/tv/1396/similar',
      '/movie/550/watch/providers',
      '/tv/1396/season/2',
      '/person/488',
      '/person/488/combined_credits',
      '/company/420',
      '/collection/10',
      '/configuration',
    ]
    for (const p of buoni) expect(percorsoConsentito(p), p).toBe(true)
  })

  it('rifiuta un percorso che porterebbe la richiesta su un altro sito', () => {
    // `new URL('https://api.themoviedb.org/3' + '//evil.com/x')` è
    // `https://evil.com/x`: inoltrerebbe altrove, con la nostra chiave in coda.
    expect(percorsoConsentito('//evil.com/rubami')).toBe(false)
    expect(percorsoConsentito('/movie/550/../../../admin')).toBe(false)
    expect(percorsoConsentito('https://evil.com/x')).toBe(false)
  })

  it('rifiuta un percorso che si porta dietro query o frammento', () => {
    // Altrimenti la regex leggerebbe una cosa e l'URL finale un'altra.
    expect(percorsoConsentito('/movie/550?api_key=altro')).toBe(false)
    expect(percorsoConsentito('/movie/550#/tv/1')).toBe(false)
  })

  it('rifiuta gli endpoint TMDB che l app non usa', () => {
    // Non è cattiveria: un proxy che serve tutto è un proxy che qualcun altro
    // userà al posto nostro.
    expect(percorsoConsentito('/account/1/favorite')).toBe(false)
    expect(percorsoConsentito('/authentication/token/new')).toBe(false)
    expect(percorsoConsentito('/movie/550/lists')).toBe(false)
    expect(percorsoConsentito('')).toBe(false)
  })

  it('non si fa ingannare da un id che non è un numero', () => {
    expect(percorsoConsentito('/movie/abc')).toBe(false)
    expect(percorsoConsentito('/person/1a2')).toBe(false)
  })
})

describe('urlTmdb', () => {
  it('mette la chiave del server, non quella che arriva dal client', () => {
    // Il caso che conta: chi chiama non deve poter sostituire la chiave (né
    // usare la nostra funzione con una chiave rubata a qualcun altro).
    const url = new URL(urlTmdb('/movie/550', { api_key: 'chiave-del-client' }, 'chiave-vera'))
    expect(url.searchParams.getAll('api_key')).toEqual(['chiave-vera'])
  })

  it('non rimanda a TMDB il parametro che serviva solo a noi', () => {
    const url = new URL(urlTmdb('/movie/550', { path: '/movie/550' }, 'k'))
    expect(url.searchParams.has('path')).toBe(false)
  })

  it('passa i parametri dell app e tiene l italiano come default', () => {
    const url = new URL(urlTmdb('/discover/movie', { sort_by: 'popularity.desc', page: '2' }, 'k'))
    expect(url.searchParams.get('sort_by')).toBe('popularity.desc')
    expect(url.searchParams.get('page')).toBe('2')
    expect(url.searchParams.get('language')).toBe('it-IT')
  })

  it('lascia scegliere la lingua quando l app la chiede', () => {
    // La seconda richiesta in inglese serve ai titoli leggibili: non va persa.
    const url = new URL(urlTmdb('/discover/movie', { language: 'en-US' }, 'k'))
    expect(url.searchParams.get('language')).toBe('en-US')
  })

  it('resta sul dominio di TMDB', () => {
    expect(new URL(urlTmdb('/movie/550', {}, 'k')).host).toBe('api.themoviedb.org')
  })
})
