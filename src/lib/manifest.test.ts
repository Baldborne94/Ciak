import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { inflateSync } from 'node:zlib'

// Il manifest decide come si comporta Ciak installata sulla schermata Home:
// lì il browser non c'è più, e ciò che è scritto qui vale senza appello.

const manifest = JSON.parse(readFileSync(resolve(__dirname, '../../public/manifest.webmanifest'), 'utf8')) as Record<string, unknown>

describe('manifest dell’app installata', () => {
  it('non blocca l’orientamento: sul tablet in orizzontale l’app gira con lui', () => {
    // "portrait" la teneva in verticale anche col tablet girato. Senza
    // indicazione vale quella del dispositivo, blocco della rotazione compreso;
    // "any" su Android girerebbe anche col blocco attivo.
    expect(manifest.orientation).toBeUndefined()
  })
})

// Le icone sono PNG generate da public/ciak.svg e public/badge.svg con
// `npm run icone`: qui si controlla che ci siano tutte, della misura dichiarata,
// e che la forma dei bordi sia quella che ogni uso richiede.
const pubblico = (nome: string) => resolve(__dirname, '../../public', nome.replace(/^\//, ''))

// Misura e trasparenza dell'angolo in alto a sinistra, leggendo il PNG: il
// primo pixel della prima riga arriva com'è qualunque sia il filtro, perché
// non ha né vicini a sinistra né una riga sopra.
function png(nome: string) {
  const dati = readFileSync(pubblico(nome))
  const larghezza = dati.readUInt32BE(16)
  const altezza = dati.readUInt32BE(20)
  const tipo = dati[25]
  const pezzi: Buffer[] = []
  for (let i = 8; i < dati.length; ) {
    const lung = dati.readUInt32BE(i)
    if (dati.toString('ascii', i + 4, i + 8) === 'IDAT') pezzi.push(dati.subarray(i + 8, i + 8 + lung))
    i += 12 + lung
  }
  const righe = inflateSync(Buffer.concat(pezzi))
  // Tipo 6 = RGBA (l'alfa è il quarto byte), tipo 2 = RGB (sempre opaco).
  const alfaAngolo = tipo === 6 ? righe[1 + 3] : 255
  return { larghezza, altezza, alfaAngolo }
}

describe('le icone', () => {
  const icone = manifest.icons as { src: string; sizes: string; purpose: string }[]

  it('ogni icona del manifest esiste ed è della misura dichiarata', () => {
    for (const icona of icone) {
      const [l, a] = icona.sizes.split('x').map(Number)
      expect(png(icona.src), icona.src).toMatchObject({ larghezza: l, altezza: a })
    }
  })

  it('la maskable arriva fino agli angoli: Android la ritaglia, e un angolo trasparente diventerebbe un buco', () => {
    const maskable = icone.find((i) => i.purpose === 'maskable')
    expect(maskable).toBeDefined()
    expect(png(maskable!.src).alfaAngolo).toBe(255)
  })

  it('le altre hanno gli angoli arrotondati, trasparenti', () => {
    for (const icona of icone.filter((i) => i.purpose === 'any')) expect(png(icona.src).alfaAngolo, icona.src).toBe(0)
  })

  it('ci sono anche la favicon, l’icona di iPhone e la sagoma per le notifiche', () => {
    const indice = readFileSync(pubblico('index.html').replace('/public/', '/'), 'utf8')
    for (const [, href] of indice.matchAll(/<link rel="(?:icon|apple-touch-icon)"[^>]*href="([^"]+)"/g)) expect(existsSync(pubblico(href)), href).toBe(true)
    expect(png('badge-96.png')).toMatchObject({ larghezza: 96, altezza: 96, alfaAngolo: 0 })
  })
})
