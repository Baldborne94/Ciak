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
      expect(servizio(nome)).toMatch(/prepara:\s*\n\s*condition: service_completed_successfully/)
    }
    expect(servizio('prepara')).toContain('/script/prepara.sh')
  })
})
