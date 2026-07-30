import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { MediaItem, PersonDetail, SavedEntity, UserTitle } from './types'

// upcomingFromFollowedPeople intreccia TMDB + libreria: mockiamo i confini e
// testiamo la logica pura (finestra temporale, chiavi composite, cast
// principale, dedup fra persone) che in passato ha già prodotto due bug reali.
vi.mock('./supabase', () => ({ supabase: null, isSupabaseConfigured: false }))
vi.mock('./tmdb', () => ({ getUpcoming: vi.fn(), getPersonDetail: vi.fn() }))
vi.mock('./userTitles', () => ({ listAll: vi.fn() }))
vi.mock('./entities', () => ({ listEntities: vi.fn() }))

import { upcomingFromFollowedPeople, personalizedUpcoming } from './alerts'
import { getPersonDetail, getUpcoming } from './tmdb'
import { listAll } from './userTitles'
import { listEntities } from './entities'

function daysFromNow(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function mediaItem(over: Partial<MediaItem>): MediaItem {
  return {
    id: 1,
    mediaType: 'movie',
    title: 'Titolo',
    originalTitle: null,
    overview: '',
    posterPath: null,
    backdropPath: null,
    releaseDate: daysFromNow(30),
    voteAverage: 7,
    genreIds: [],
    originalLanguage: 'en',
    ...over,
  }
}

function entity(id: number, name: string): SavedEntity {
  return { id: String(id), entity_id: id, name } as unknown as SavedEntity
}

function personDetail(over: Partial<PersonDetail>): PersonDetail {
  return {
    id: 1,
    name: 'Persona',
    profilePath: null,
    department: 'Acting',
    knownFor: null,
    biography: null,
    birthday: null,
    placeOfBirth: null,
    credits: [],
    mainCastKeys: [],
    ...over,
  }
}

function libraryRow(mediaType: string, tmdbId: number): UserTitle {
  return { media_type: mediaType, tmdb_id: tmdbId } as unknown as UserTitle
}

beforeEach(() => {
  vi.mocked(listEntities).mockResolvedValue([])
  vi.mocked(listAll).mockResolvedValue([])
  vi.mocked(getPersonDetail).mockResolvedValue(personDetail({}))
  vi.mocked(getUpcoming).mockResolvedValue([])
})

describe('upcomingFromFollowedPeople', () => {
  it('torna vuoto se non segui nessuno (niente chiamate TMDB)', async () => {
    expect(await upcomingFromFollowedPeople('u1')).toEqual([])
    expect(getPersonDetail).not.toHaveBeenCalled()
  })

  it('per gli attori mostra solo i titoli in cui sono cast principale', async () => {
    vi.mocked(listEntities).mockResolvedValue([entity(7, 'Clancy Brown')])
    vi.mocked(getPersonDetail).mockResolvedValue(
      personDetail({
        department: 'Acting',
        credits: [
          mediaItem({ id: 10, title: 'Protagonista' }),
          mediaItem({ id: 11, title: 'Comparsa' }),
        ],
        mainCastKeys: ['movie-10'],
      }),
    )
    const out = await upcomingFromFollowedPeople('u1')
    expect(out.map((o) => o.item.title)).toEqual(['Protagonista'])
    expect(out[0].people).toEqual(['Clancy Brown'])
  })

  it('per i registi il credito basta (nessun concetto di billing)', async () => {
    vi.mocked(listEntities).mockResolvedValue([entity(8, 'Denis Villeneuve')])
    vi.mocked(getPersonDetail).mockResolvedValue(
      personDetail({
        department: 'Directing',
        credits: [mediaItem({ id: 20, title: 'Nuovo film' })],
        mainCastKeys: [],
      }),
    )
    const out = await upcomingFromFollowedPeople('u1')
    expect(out.map((o) => o.item.title)).toEqual(['Nuovo film'])
  })

  it('esclude titoli già in libreria usando la chiave composita tipo+id', async () => {
    vi.mocked(listEntities).mockResolvedValue([entity(8, 'Regista')])
    // In libreria c'è il FILM con id 30: la SERIE con lo stesso id 30 è
    // un'opera diversa e deve restare visibile.
    vi.mocked(listAll).mockResolvedValue([libraryRow('movie', 30)])
    vi.mocked(getPersonDetail).mockResolvedValue(
      personDetail({
        department: 'Directing',
        credits: [
          mediaItem({ id: 30, mediaType: 'movie', title: 'Film già tracciato' }),
          mediaItem({ id: 30, mediaType: 'tv', title: 'Serie omonima' }),
        ],
      }),
    )
    const out = await upcomingFromFollowedPeople('u1')
    expect(out.map((o) => o.item.title)).toEqual(['Serie omonima'])
  })

  it('mostra solo ciò che deve ancora uscire: niente date passate né mancanti', async () => {
    // La pagina si chiama "In arrivo" e offre «Avvisami»: un titolo già uscito
    // (anche di soli due giorni) non ci va, altrimenti l'intestazione mente.
    vi.mocked(listEntities).mockResolvedValue([entity(8, 'Regista')])
    vi.mocked(getPersonDetail).mockResolvedValue(
      personDetail({
        department: 'Directing',
        credits: [
          mediaItem({ id: 40, title: 'Vecchio', releaseDate: daysFromNow(-60) }),
          mediaItem({ id: 41, title: 'Senza data', releaseDate: null }),
          mediaItem({ id: 42, title: 'Uscito da poco', releaseDate: daysFromNow(-2) }),
          mediaItem({ id: 43, title: 'In uscita', releaseDate: daysFromNow(7) }),
        ],
      }),
    )
    const out = await upcomingFromFollowedPeople('u1')
    expect(out.map((o) => o.item.title)).toEqual(['In uscita'])
  })

  it('unisce più persone sullo stesso titolo e ordina per data di uscita', async () => {
    vi.mocked(listEntities).mockResolvedValue([entity(1, 'Attrice A'), entity(2, 'Attore B')])
    const shared = mediaItem({ id: 50, title: 'Film condiviso', releaseDate: daysFromNow(20) })
    vi.mocked(getPersonDetail)
      .mockResolvedValueOnce(
        personDetail({
          department: 'Acting',
          credits: [shared, mediaItem({ id: 51, title: 'Prima uscita', releaseDate: daysFromNow(5) })],
          mainCastKeys: ['movie-50', 'movie-51'],
        }),
      )
      .mockResolvedValueOnce(
        personDetail({ department: 'Acting', credits: [shared], mainCastKeys: ['movie-50'] }),
      )
    const out = await upcomingFromFollowedPeople('u1')
    expect(out.map((o) => o.item.title)).toEqual(['Prima uscita', 'Film condiviso'])
    expect(out[1].people.sort()).toEqual(['Attore B', 'Attrice A'])
  })

  it('una persona non risolvibile non blocca le altre', async () => {
    vi.mocked(listEntities).mockResolvedValue([entity(1, 'Rotta'), entity(2, 'Ok')])
    vi.mocked(getPersonDetail)
      .mockRejectedValueOnce(new Error('TMDB down'))
      .mockResolvedValueOnce(
        personDetail({ department: 'Directing', credits: [mediaItem({ id: 60, title: 'Salvo' })] }),
      )
    const out = await upcomingFromFollowedPeople('u1')
    expect(out.map((o) => o.item.title)).toEqual(['Salvo'])
  })
})

describe('personalizedUpcoming', () => {
  it('senza dati di gusto ripiega sull’ordine per data di uscita', async () => {
    vi.mocked(getUpcoming).mockResolvedValue([
      mediaItem({ id: 1, title: 'Dopo', releaseDate: daysFromNow(20) }),
      mediaItem({ id: 2, title: 'Prima', releaseDate: daysFromNow(5) }),
    ])
    const out = await personalizedUpcoming('u1')
    expect(out.map((o) => o.title)).toEqual(['Prima', 'Dopo'])
  })

  it('ordina per affinità di genere e scarta i titoli senza affinità', async () => {
    vi.mocked(listAll).mockResolvedValue([
      { status: 'watched', is_favorite: false, genre_ids: [27, 27, 53] } as unknown as UserTitle,
      { status: 'watched', is_favorite: true, genre_ids: [27] } as unknown as UserTitle,
    ])
    vi.mocked(getUpcoming).mockResolvedValue([
      mediaItem({ id: 1, title: 'Commedia', genreIds: [35] }),
      mediaItem({ id: 2, title: 'Horror', genreIds: [27] }),
      mediaItem({ id: 3, title: 'Thriller', genreIds: [53] }),
    ])
    const out = await personalizedUpcoming('u1')
    expect(out.map((o) => o.title)).toEqual(['Horror', 'Thriller'])
  })
})
