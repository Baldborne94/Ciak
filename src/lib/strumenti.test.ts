import { describe, it, expect } from 'vitest'
import { execFile, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

// Gli script per il PC (strumenti/) girano su Windows, lontano dalla CI: qui
// si prova ciò che si può senza Windows. Come serviceWorker.test.ts, si leggono
// i file veri invece di una copia.

const cartella = resolve(__dirname, '../../strumenti')
const script = join(cartella, 'prepara-ciak.ps1')
const perWindows = readdirSync(cartella).filter((f) => /\.(ps1|bat)$/.test(f))

describe('strumenti: file che Windows sa leggere', () => {
  it.each(perWindows)('%s è solo ASCII, con i fine riga di Windows', (nome) => {
    const testo = readFileSync(join(cartella, nome), 'latin1')
    // Windows PowerShell legge un .ps1 senza BOM come ANSI: una lettera
    // accentata diventa illeggibile. Un .bat con i soli "a capo" di Linux può
    // fermarsi a metà.
    expect([...testo].filter((c) => c.charCodeAt(0) > 127)).toEqual([])
    expect(testo.split('\n').slice(0, -1).every((riga) => riga.endsWith('\r'))).toBe(true)
  })

  it('Google Drive non c’è più: niente percorsi né messaggi che lo nominano', () => {
    for (const nome of perWindows) {
      // «Get-PSDrive» è il comando che elenca i dischi, non Google Drive.
      expect(readFileSync(join(cartella, nome), 'latin1'), nome).not.toMatch(/\bDrive\b|Il mio Drive|Intrattenimento/)
    }
  })
})

// PowerShell c'è sui runner Ubuntu di GitHub: lì lo script si lancia davvero.
const pwsh = spawnSync('pwsh', ['-v']).status === 0

function lancia(...argomenti: string[]): Promise<{ codice: number; uscita: string }> {
  return new Promise((risolvi) => {
    execFile(
      'pwsh',
      ['-NoProfile', '-NonInteractive', '-File', script, ...argomenti],
      { env: { ...process.env, CIAK_SENZA_PAUSA: '1' } },
      (errore, stdout, stderr) => risolvi({ codice: errore ? Number(errore.code ?? 1) : 0, uscita: stdout + stderr }),
    )
  })
}

function disco() {
  const radice = mkdtempSync(join(tmpdir(), 'ciak-disco-'))
  const ciak = join(radice, 'Ciak')
  for (const scheda of ['FILM', 'SERIE TV', '.nascosta']) mkdirSync(join(ciak, scheda), { recursive: true })
  return { radice, ciak }
}

describe.runIf(pwsh).concurrent('prepara-ciak: le cartelle', () => {
  it('senza il disco lo dice e si ferma', async () => {
    const { radice } = disco()
    const { codice, uscita } = await lancia('-Destinazione', join(radice, 'Manca'))
    expect(codice).toBe(1)
    expect(uscita).toContain("il disco esterno e' attaccato?")
  }, 30_000)

  it('la prima volta crea «Da preparare» accanto a Ciak, con le stesse schede', async () => {
    const { radice, ciak } = disco()
    const { codice, uscita } = await lancia('-Destinazione', ciak)
    expect(codice).toBe(0)
    expect(uscita).toContain('Mettici i video nuovi')
    expect(readdirSync(join(radice, 'Da preparare')).sort()).toEqual(['FILM', 'SERIE TV'])
  }, 30_000)

  it.each([
    ['la stessa cartella', ''],
    ['una scheda di Ciak', 'FILM'],
  ])('rifiuta i video nuovi presi da %s, senza toccare la videoteca', async (_, sotto) => {
    const { ciak } = disco()
    // Il film già pronto sembrerebbe un originale con la sua copia: è lui che
    // si cancellerebbe.
    const film = join(ciak, 'FILM', 'Paprika.2006.mp4')
    writeFileSync(film, 'video')
    const { codice, uscita } = await lancia('-Destinazione', ciak, '-Origine', join(ciak, sotto))
    expect(codice).toBe(1)
    expect(uscita).toContain('devono stare in due cartelle separate')
    expect(existsSync(film)).toBe(true)
  }, 30_000)
})

// Le funzioni dello script, prese dal file vero col parser di PowerShell e
// provate da sole: lo script intero vorrebbe un disco e dei video.
function funzioni(nomi: string[], variabili: string[], prova: string): Promise<string> {
  const carica = `
    $ast = [System.Management.Automation.Language.Parser]::ParseFile('${script}', [ref]$null, [ref]$null)
    foreach ($a in $ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.AssignmentStatementAst] -and $n.Parent.Parent -eq $ast }, $false)) {
      if (@(${variabili.map((v) => `'${v}'`).join(',')}) -contains $a.Left.VariablePath.UserPath) { . ([scriptblock]::Create($a.Extent.Text)) }
    }
    foreach ($f in $ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] }, $true)) {
      if (@(${nomi.map((n) => `'${n}'`).join(',')}) -contains $f.Name) { . ([scriptblock]::Create($f.Extent.Text)) }
    }
    ${prova}`
  return new Promise((risolvi, rifiuta) => {
    execFile('pwsh', ['-NoProfile', '-NonInteractive', '-Command', carica], (errore, stdout, stderr) =>
      errore ? rifiuta(new Error(stderr || errore.message)) : risolvi(stdout.trim()),
    )
  })
}

describe.runIf(pwsh).concurrent('prepara-ciak: i sottotitoli in immagine', () => {
  const lingue = (flussi: unknown[]) =>
    funzioni(
      ['Lingua', 'LingueSoloInImmagine'],
      ['SottotitoliTesto', 'LingueVolute'],
      `(LingueSoloInImmagine ('${JSON.stringify(flussi)}' | ConvertFrom-Json)) -join ','`,
    )
  const sub = (codec_name: string, language: string) => ({ codec_type: 'subtitle', codec_name, tags: { language } })

  it('dice le lingue che ci sono solo come immagini (PGS, VobSub)', async () => {
    expect(await lingue([{ codec_type: 'video', codec_name: 'hevc' }, sub('hdmv_pgs_subtitle', 'ita'), sub('dvd_subtitle', 'eng')])).toBe('it,en')
  }, 30_000)

  it('tace se la stessa lingua c’è anche in testo, o se è una lingua che Ciak non offre', async () => {
    expect(await lingue([sub('hdmv_pgs_subtitle', 'eng'), sub('ass', 'eng'), sub('hdmv_pgs_subtitle', 'jpn')])).toBe('')
  }, 30_000)
})
