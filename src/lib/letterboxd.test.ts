import { describe, expect, it } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import { fileDaScelta, filmDellExport, leggiCsv, leggiExport } from './letterboxd'

// L'esportazione di Letterboxd, coi file come li scrive davvero.

const FILE = new Map([
  ['letterboxd-spettatore-2026-10-31-18-00-utc/watched.csv', 'Date,Name,Year,Letterboxd URI\n2024-01-02,The Lion King,1994,https://boxd.it/1\n2024-03-04,Parasite,2019,https://boxd.it/2\n'],
  ['letterboxd-spettatore-2026-10-31-18-00-utc/ratings.csv', 'Date,Name,Year,Letterboxd URI,Rating\n2024-03-04,Parasite,2019,https://boxd.it/2,4.5\n'],
  [
    'letterboxd-spettatore-2026-10-31-18-00-utc/diary.csv',
    'Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date\n2024-03-05,Parasite,2019,https://boxd.it/x,4.5,,,2024-03-04\n2025-01-01,Parasite,2019,https://boxd.it/y,5,Yes,,2024-12-31\n',
  ],
  ['letterboxd-spettatore-2026-10-31-18-00-utc/watchlist.csv', 'Date,Name,Year,Letterboxd URI\n2025-05-05,"Paths of Glory",1957,https://boxd.it/3\n'],
  ['letterboxd-spettatore-2026-10-31-18-00-utc/likes/films.csv', 'Date,Name,Year,Letterboxd URI\n2024-01-02,The Lion King,1994,https://boxd.it/1\n'],
  [
    'letterboxd-spettatore-2026-10-31-18-00-utc/reviews.csv',
    'Date,Name,Year,Letterboxd URI,Rating,Rewatch,Review,Tags,Watched Date\n2024-03-05,Parasite,2019,https://boxd.it/x,4.5,,"Bong, che film.\nDa rivedere: ""capolavoro"".",,2024-03-04\n',
  ],
  [
    'letterboxd-spettatore-2026-10-31-18-00-utc/lists/folk-horror.csv',
    'Letterboxd list export v7\nDate,Name,Tags,URL,Description\n2025-02-02,Folk horror,,https://letterboxd.com/spettatore/list/folk-horror/,Il bosco e la paura\n\nPosition,Name,Year,URL,Description\n1,The Witch,2015,https://letterboxd.com/film/the-witch/,\n2,The Wicker Man,1973,https://letterboxd.com/film/the-wicker-man/,\n',
  ],
  // I cancellati non sono roba tua da importare.
  ['letterboxd-spettatore-2026-10-31-18-00-utc/deleted/diary.csv', 'Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date\n2020-01-01,Cats,2019,https://boxd.it/z,0.5,,,2020-01-01\n'],
])

describe('leggiCsv', () => {
  it('virgolette, virgole e a capo dentro un campo, "" per una virgoletta', () => {
    expect(leggiCsv('a,"b, c","d\n""e"""\r\nf,g\n')).toEqual([
      ['a', 'b, c', 'd\n"e"'],
      ['f', 'g'],
    ])
  })
})

describe('leggiExport', () => {
  const e = leggiExport(FILE)

  it('visti, voti, diario, watchlist e «mi piace»', () => {
    expect(e.visti.map((v) => [v.film.nome, v.film.anno, v.data])).toEqual([
      ['The Lion King', 1994, '2024-01-02'],
      ['Parasite', 2019, '2024-03-04'],
    ])
    expect(e.voti).toEqual([{ film: { nome: 'Parasite', anno: 2019 }, voto: 4.5, data: '2024-03-04' }])
    // La data della visione, non quella in cui la si è scritta; i cancellati no.
    expect(e.diario.map((d) => [d.visto, d.voto, d.rivisto])).toEqual([
      ['2024-03-04', 4.5, false],
      ['2024-12-31', 5, true],
    ])
    expect(e.watchlist.map((w) => w.film.nome)).toEqual(['Paths of Glory'])
    expect(e.miPiace.map((m) => m.film.nome)).toEqual(['The Lion King'])
  })

  it('le recensioni, anche su più righe', () => {
    expect(e.recensioni).toEqual([{ film: { nome: 'Parasite', anno: 2019 }, testo: 'Bong, che film.\nDa rivedere: "capolavoro".', visto: '2024-03-04' }])
  })

  it('le liste, col nome, la descrizione e i loro film', () => {
    expect(e.liste).toEqual([
      {
        nome: 'Folk horror',
        descrizione: 'Il bosco e la paura',
        film: [
          { nome: 'The Witch', anno: 2015 },
          { nome: 'The Wicker Man', anno: 1973 },
        ],
      },
    ])
  })

  it('ogni film una volta sola', () => {
    expect(filmDellExport(e).map((f) => f.nome)).toEqual(['The Lion King', 'Parasite', 'Paths of Glory', 'The Witch', 'The Wicker Man'])
  })
})

describe('fileDaScelta', () => {
  it('apre lo ZIP di Letterboxd, e prende anche i CSV scelti da soli', async () => {
    const zip = zipSync(Object.fromEntries([...FILE].map(([nome, testo]) => [nome, strToU8(testo)])))
    const letti = await fileDaScelta([new File([Uint8Array.from(zip)], 'letterboxd-spettatore.zip'), new File(['Date,Name,Year,Letterboxd URI\n'], 'watchlist.csv')])
    expect(leggiExport(letti).visti).toHaveLength(2)
    expect([...letti.keys()]).toContain('watchlist.csv')
  })
})
