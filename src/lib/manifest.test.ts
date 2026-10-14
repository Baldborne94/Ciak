import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

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
