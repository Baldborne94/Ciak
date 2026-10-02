import { describe, it, expect } from 'vitest'
import { azioneTasto, metadatiSessione } from './comandiLettore'

const tasto = (key: string, extra: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}) => ({
  key,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  ...extra,
})
const pagina = { tagName: 'BODY' }

describe('azioneTasto', () => {
  it('i tasti del lettore, come su YouTube', () => {
    expect(azioneTasto(tasto(' '), pagina)).toBe('pausa')
    expect(azioneTasto(tasto('k'), pagina)).toBe('pausa')
    expect(azioneTasto(tasto('ArrowLeft'), pagina)).toBe('indietro')
    expect(azioneTasto(tasto('j'), pagina)).toBe('indietro')
    expect(azioneTasto(tasto('ArrowRight'), pagina)).toBe('avanti')
    expect(azioneTasto(tasto('l'), pagina)).toBe('avanti')
    expect(azioneTasto(tasto('f'), pagina)).toBe('schermo')
    expect(azioneTasto(tasto('s'), pagina)).toBe('sigla')
    expect(azioneTasto(tasto('n'), pagina)).toBe('prossimo')
    expect(azioneTasto(tasto('m'), pagina)).toBe('audio')
  })

  it('anche con le maiuscole (il blocco maiuscole acceso)', () => {
    expect(azioneTasto(tasto('F'), pagina)).toBe('schermo')
    expect(azioneTasto(tasto('N'), pagina)).toBe('prossimo')
  })

  it('anche col video o un pulsante in primo piano', () => {
    expect(azioneTasto(tasto(' '), { tagName: 'VIDEO' })).toBe('pausa')
    expect(azioneTasto(tasto('s'), { tagName: 'BUTTON' })).toBe('sigla')
  })

  it('mentre si scrive i tasti restano ai campi', () => {
    expect(azioneTasto(tasto('f'), { tagName: 'INPUT' })).toBeNull()
    expect(azioneTasto(tasto(' '), { tagName: 'TEXTAREA' })).toBeNull()
    expect(azioneTasto(tasto('ArrowLeft'), { tagName: 'SELECT' })).toBeNull()
    expect(azioneTasto(tasto('k'), { tagName: 'DIV', isContentEditable: true })).toBeNull()
  })

  it('le scorciatoie del browser restano al browser, e gli altri tasti non fanno niente', () => {
    expect(azioneTasto(tasto('f', { ctrlKey: true }), pagina)).toBeNull()
    expect(azioneTasto(tasto('l', { metaKey: true }), pagina)).toBeNull()
    expect(azioneTasto(tasto('ArrowLeft', { altKey: true }), pagina)).toBeNull()
    expect(azioneTasto(tasto('x'), pagina)).toBeNull()
    expect(azioneTasto(tasto('Enter'), pagina)).toBeNull()
  })
})

describe('metadatiSessione', () => {
  it('il titolo con l episodio e la locandina in due misure', () => {
    expect(metadatiSessione('South Park · S3E8', '/sp.jpg')).toEqual({
      title: 'South Park · S3E8',
      artist: 'Ciak',
      artwork: [
        { src: 'https://image.tmdb.org/t/p/w185/sp.jpg', sizes: '185x278', type: 'image/jpeg' },
        { src: 'https://image.tmdb.org/t/p/w500/sp.jpg', sizes: '500x750', type: 'image/jpeg' },
      ],
    })
  })

  it('senza locandina, solo il titolo', () => {
    expect(metadatiSessione('Song of the Sea', null)).toEqual({ title: 'Song of the Sea', artist: 'Ciak', artwork: [] })
  })
})
