import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  collegaJellyfin,
  elencaVideoJellyfin,
  flussoDiretto,
  flussoHls,
  idJellyfin,
  infoDaSorgente,
  jellyfinCollegato,
  leggiJellyfin,
  normalizzaIndirizzo,
  riproducibileDirettamente,
  scollegaJellyfin,
  sottotitoloJellyfin,
  tracciaPredefinita,
  unisciFonti,
  videoDaJellyfin,
} from './jellyfin'

beforeEach(() => {
  const dati = new Map<string, string>()
  globalThis.localStorage = {
    getItem: (k: string) => dati.get(k) ?? null,
    setItem: (k: string, v: string) => void dati.set(k, v),
    removeItem: (k: string) => void dati.delete(k),
    clear: () => dati.clear(),
    key: () => null,
    length: 0,
  }
})
afterEach(() => vi.unstubAllGlobals())

const ID = '06006283103f8493628d6b5b9a95da9d'
const ID2 = '27a641bb7cf83b9b409f4d868d9562d8'

describe('videoDaJellyfin', () => {
  it('una libreria per categoria: la categoria è la sua cartella, poi film, serie e stagione', () => {
    const librerie = [
      { Name: 'Film', Locations: ['E:\\Ciak\\FILM'] },
      { Name: 'Serie', Locations: ['E:\\Ciak\\SERIE TV'] },
    ]
    const v = videoDaJellyfin(
      [
        { Id: ID, Type: 'Movie', Path: 'E:\\Ciak\\FILM\\Song of the Sea (2014)\\Song.of.the.Sea.2014.mp4', DateCreated: '2026-10-11T16:54:44Z' },
        { Id: ID2, Type: 'Episode', Path: 'E:\\Ciak\\SERIE TV\\South Park\\Season 03\\01 Rainforest.mkv' },
      ],
      librerie,
    )
    expect(v).toEqual([
      {
        id: `jf-${ID}`,
        name: 'Song.of.the.Sea.2014.mp4',
        size: null,
        mimeType: 'video/mp4',
        cartella: 'Song of the Sea (2014)',
        serie: null,
        categoria: 'FILM',
        aggiunto: '2026-10-11T16:54:44Z',
        cartellaId: null,
      },
      expect.objectContaining({ id: `jf-${ID2}`, name: '01 Rainforest.mkv', mimeType: 'video/mkv', cartella: 'Season 03', serie: 'South Park', categoria: 'SERIE TV' }),
    ])
  })

  it('la cartella Ciak intera come libreria: la categoria è la prima cartella sotto', () => {
    const v = videoDaJellyfin(
      [
        { Id: ID, Type: 'Movie', Path: '/mnt/disco/Ciak/ANIME/Perfect Blue (1997)/Perfect.Blue.mp4' },
        { Id: ID2, Type: 'Video', Path: '/mnt/disco/Ciak/sciolto.mp4' },
      ],
      [{ Name: 'Ciak', Locations: ['/mnt/disco/Ciak/'] }],
    )
    expect(v[0]).toMatchObject({ categoria: 'ANIME', cartella: 'Perfect Blue (1997)', serie: null })
    expect(v[1]).toMatchObject({ categoria: null, cartella: null })
  })

  it('un film direttamente nella cartella della categoria non ha una cartella sua', () => {
    const [v] = videoDaJellyfin([{ Id: ID, Type: 'Movie', Path: 'D:/Video/FILM/Alien.1979.mp4' }], [{ Name: 'Film', Locations: ['d:\\video\\film'] }])
    expect(v).toMatchObject({ categoria: 'FILM', cartella: null })
  })

  it('senza librerie (utente non amministratore) la cartella è quella del file', () => {
    const [v] = videoDaJellyfin([{ Id: ID, Type: 'Movie', Path: '/media/FILM/Alien (1979)/Alien.mp4' }], [])
    expect(v).toMatchObject({ categoria: null, cartella: 'Alien (1979)' })
  })

  it('salta gli elementi senza percorso o con un id che non è di Jellyfin', () => {
    expect(videoDaJellyfin([{ Id: ID, Type: 'Movie' }, { Id: 'x', Type: 'Movie', Path: '/a/b.mp4' }], [])).toEqual([])
  })
})

describe('indirizzo e id', () => {
  it('aggiunge https e toglie la barra finale', () => {
    expect(normalizzaIndirizzo(' casa.tail1234.ts.net/ ', true)).toBe('https://casa.tail1234.ts.net')
    expect(normalizzaIndirizzo('https://casa.ts.net:8920/jellyfin/', true)).toBe('https://casa.ts.net:8920/jellyfin')
  })

  it('un server in HTTP da una pagina HTTPS si spiega, invece di fallire in silenzio', () => {
    expect(() => normalizzaIndirizzo('http://192.168.1.10:8096', true)).toThrow(/tailscale serve/)
    expect(normalizzaIndirizzo('http://192.168.1.10:8096', false)).toBe('http://192.168.1.10:8096')
    expect(() => normalizzaIndirizzo('  ', true)).toThrow(/Scrivi/)
  })

  it('l’id di Jellyfin dentro quello di Ciak', () => {
    expect(idJellyfin(`jf-${ID}`)).toBe(ID)
    expect(idJellyfin('1AbCdEfGhIjKlMn')).toBeNull()
    expect(idJellyfin('jf-../../Users')).toBeNull()
  })
})

const sorgente = {
  Id: ID,
  Path: '/media/FILM/Song/Song.mp4',
  Container: 'mov,mp4,m4a,3gp,3g2,mj2',
  Size: 1000,
  MediaStreams: [
    { Index: 0, Type: 'Subtitle', Codec: 'subrip', Language: 'ita', IsExternal: true, IsTextSubtitleStream: true, DisplayTitle: 'Italian' },
    // Jellyfin segna predefinite anche le tracce accanto al file.
    { Index: 1, Type: 'Audio', Codec: 'aac', Language: 'eng', IsExternal: true, IsDefault: true },
    { Index: 2, Type: 'Video', Codec: 'h264', BitDepth: 8 },
    { Index: 3, Type: 'Audio', Codec: 'aac', Language: 'jpn', IsDefault: true },
    { Index: 4, Type: 'Audio', Codec: 'ac3', Language: 'ita' },
    { Index: 5, Type: 'Subtitle', Codec: 'PGSSUB', Language: 'eng', IsTextSubtitleStream: false },
  ],
}

describe('il video per il lettore', () => {
  it('le tracce audio: prima quelle del file, nel loro ordine, poi quelle accanto', () => {
    const info = infoDaSorgente(sorgente)
    expect(info.audio.map((a) => [a.indice, a.lingua])).toEqual([
      [3, 'jpn'],
      [4, 'ita'],
      [1, 'eng'],
    ])
    expect(tracciaPredefinita(info)?.indice).toBe(3)
    // Solo i sottotitoli di testo: i PGS il browser non li disegna.
    expect(info.sottotitoli).toEqual([{ indice: 0, lingua: 'ita', titolo: 'Italian', esterno: true }])
    expect(info.nome).toBe('Song.mp4')
  })

  it('un MP4 H.264 con audio AAC si legge così com’è; MKV, HEVC e Dolby no', () => {
    expect(riproducibileDirettamente(infoDaSorgente(sorgente))).toBe(true)
    expect(riproducibileDirettamente(infoDaSorgente({ ...sorgente, Container: 'mkv' }))).toBe(false)
    const hevc = { ...sorgente, MediaStreams: sorgente.MediaStreams.map((s) => (s.Type === 'Video' ? { ...s, Codec: 'hevc' } : s)) }
    expect(riproducibileDirettamente(infoDaSorgente(hevc))).toBe(false)
    const dieciBit = { ...sorgente, MediaStreams: sorgente.MediaStreams.map((s) => (s.Type === 'Video' ? { ...s, BitDepth: 10 } : s)) }
    expect(riproducibileDirettamente(infoDaSorgente(dieciBit))).toBe(false)
    const dolby = { ...sorgente, MediaStreams: sorgente.MediaStreams.filter((s) => s.Index !== 3) }
    expect(riproducibileDirettamente(infoDaSorgente(dolby))).toBe(false)
  })

  it('gli indirizzi dei flussi portano il token e, per l’HLS, la lingua scelta', () => {
    const config = { url: 'https://casa.ts.net', token: 'tok en', userId: 'u', utente: 'ale' }
    const info = infoDaSorgente(sorgente)
    expect(flussoDiretto(`jf-${ID}`, config)).toBe(`https://casa.ts.net/Videos/${ID}/stream?static=true&api_key=tok%20en`)
    const hls = new URL(flussoHls(`jf-${ID}`, info, 4, 'sess1', config))
    expect(hls.pathname).toBe(`/Videos/${ID}/master.m3u8`)
    expect(hls.searchParams.get('AudioStreamIndex')).toBe('4')
    expect(hls.searchParams.get('MediaSourceId')).toBe(ID)
    expect(hls.searchParams.get('allowVideoStreamCopy')).toBe('true')
    expect(new URL(flussoHls(`jf-${ID}`, info, null, 's', config)).searchParams.has('AudioStreamIndex')).toBe(false)
    expect(sottotitoloJellyfin(`jf-${ID}`, info, 0, config)).toBe(`https://casa.ts.net/Videos/${ID}/${ID}/Subtitles/0/0/Stream.vtt?api_key=tok%20en`)
    expect(flussoDiretto('1AbCdEfGhIjKlMn', config)).toBe('')
  })
})

describe('collegamento ed elenco', () => {
  it('collega con utente e password e ricorda solo il token', async () => {
    const fetchFinto = vi.fn(async () => new Response(JSON.stringify({ AccessToken: 'TOK', User: { Id: 'U1', Name: 'Ale' } })))
    vi.stubGlobal('fetch', fetchFinto)
    vi.stubGlobal('location', { protocol: 'https:' })
    await collegaJellyfin('casa.ts.net', 'ale', 'segreta')
    const [url, init] = fetchFinto.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://casa.ts.net/Users/AuthenticateByName')
    expect(JSON.parse(init.body as string)).toEqual({ Username: 'ale', Pw: 'segreta' })
    expect(leggiJellyfin()).toEqual({ url: 'https://casa.ts.net', token: 'TOK', userId: 'U1', utente: 'Ale' })
    expect(JSON.stringify(leggiJellyfin())).not.toContain('segreta')
    scollegaJellyfin()
    expect(jellyfinCollegato()).toBe(false)
    // Il token si revoca anche sul server.
    const [uscita, initUscita] = fetchFinto.mock.calls[1] as unknown as [string, RequestInit]
    expect(uscita).toBe('https://casa.ts.net/Sessions/Logout')
    expect((initUscita.headers as Record<string, string>).Authorization).toContain('Token="TOK"')
  })

  it('una password sbagliata e un server spento si dicono in chiaro', async () => {
    vi.stubGlobal('location', { protocol: 'https:' })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 401 })))
    await expect(collegaJellyfin('casa.ts.net', 'ale', 'x')).rejects.toThrow('Utente o password sbagliati.')
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))
    await expect(collegaJellyfin('casa.ts.net', 'ale', 'x')).rejects.toThrow(/Tailscale/)
    expect(jellyfinCollegato()).toBe(false)
  })

  it('l’elenco usa le librerie; senza i permessi per leggerle va avanti col solo percorso', async () => {
    localStorage.setItem('ciak:jellyfin', JSON.stringify({ url: 'https://casa.ts.net', token: 'TOK', userId: 'U1', utente: 'ale' }))
    const elementi = { Items: [{ Id: ID, Type: 'Movie', Path: '/m/FILM/Alien (1979)/Alien.mp4' }] }
    const conLibrerie = vi.fn(async (url: string) =>
      url.includes('VirtualFolders') ? new Response(JSON.stringify([{ Name: 'Film', Locations: ['/m/FILM'] }])) : new Response(JSON.stringify(elementi)),
    )
    vi.stubGlobal('fetch', conLibrerie)
    expect((await elencaVideoJellyfin())[0]).toMatchObject({ categoria: 'FILM', cartella: 'Alien (1979)' })
    const chiamata = conLibrerie.mock.calls[1] as unknown as [string, RequestInit]
    expect(chiamata[0]).toContain('/Items?userId=U1&Recursive=true')
    expect((chiamata[1].headers as Record<string, string>).Authorization).toContain('Token="TOK"')

    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url.includes('VirtualFolders') ? new Response('', { status: 403 }) : new Response(JSON.stringify(elementi)))))
    expect((await elencaVideoJellyfin())[0]).toMatchObject({ categoria: null, cartella: 'Alien (1979)' })

    // Un token tolto dal server non si ingoia: va ricollegato.
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 401 })))
    await expect(elencaVideoJellyfin()).rejects.toMatchObject({ sessione: true })
  })
})

describe('unisciFonti', () => {
  const v = (id: string, name: string) => ({ id, name, size: null, mimeType: 'video/mp4', cartella: null })
  it('lo stesso file su Drive e a casa compare una volta, quella di casa', () => {
    const tutti = unisciFonti([v('d1', 'Alien.1979.mp4'), v('d2', 'Brazil.1985.mp4')], [v(`jf-${ID}`, 'alien.1979.MP4')])
    expect(tutti.map((x) => x.id)).toEqual([`jf-${ID}`, 'd2'])
  })
  it('senza il server di casa l’elenco di Drive resta quello', () => {
    const drive = [v('d1', 'Alien.1979.mp4')]
    expect(unisciFonti(drive, [])).toBe(drive)
  })
})
