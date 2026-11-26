import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// nas/docker-compose.yaml: le regole imparate sul NAS vero (UGREEN), dove i
// file copiati nella cartella condivisa non sono leggibili dall'utente del
// database.
const compose = readFileSync(resolve(__dirname, '../../nas/docker-compose.yaml'), 'utf8')

function servizio(nome: string): string {
  const inizio = compose.indexOf(`\n  ${nome}:\n`)
  expect(inizio).toBeGreaterThan(-1)
  const dopo = compose.slice(inizio + 1).search(/\n {2}[a-z-]+:\n/)
  return compose.slice(inizio, dopo === -1 ? undefined : inizio + 1 + dopo)
}

describe('docker-compose del NAS', () => {
  it('niente file letti dal database alla prima accensione', () => {
    // Uno illeggibile («Permission denied») fermava la preparazione: le
    // password interne non venivano mai impostate e login e tabelle
    // restavano fuori dal database.
    expect(compose).not.toMatch(/docker-entrypoint-initdb\.d/)
  })

  it('login e tabelle partono dopo che «prepara» ha messo le password', () => {
    for (const nome of ['auth', 'rest']) {
      expect(servizio(nome)).toMatch(/prepara:\s*\n\s*condition: service_healthy/)
    }
    expect(servizio('prepara')).toContain('/script/prepara.sh')
    // «Pronto» solo quando le password ci sono: il segno sta in un tmpfs, che
    // riparte vuoto a ogni avvio (un segno rimasto dal giro prima mentirebbe).
    expect(servizio('prepara')).toMatch(/test: \["CMD", "test", "-f", "\/run\/ciak\/pronta"\]/)
    expect(servizio('prepara')).toMatch(/tmpfs:\s*\n\s*- \/run\/ciak/)
  })

  it('i container che finiscono il lavoro restano accesi, o l’app del NAS segna «Errore»', () => {
    // Nell'app Docker di UGREEN un progetto con un container fermo è «Errore»,
    // anche se si è fermato perché aveva finito: un «Errore» fisso nasconde
    // quelli veri.
    for (const nome of ['prepara', 'migra']) expect(servizio(nome)).toContain('restart: unless-stopped')
    expect(compose).not.toMatch(/restart: "no"/)
  })
})
