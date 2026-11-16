// Rifà le icone PNG di Ciak dai due disegni in public/: ciak.svg (l'icona,
// anche favicon) e badge.svg (la sagoma per le notifiche). Si lancia a mano
// dopo aver ritoccato un SVG: `npm run icone`. Usa il Chromium di Playwright,
// che c'è già per i test, così le PNG sono il disegno vero e non una copia.
import { readFileSync, writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const pub = new URL('../public/', import.meta.url)
const leggi = (nome) => readFileSync(new URL(nome, pub), 'utf8')

const icona = leggi('ciak.svg')
// Maskable: Android ritaglia l'icona a cerchio, goccia o quadrato. Lo sfondo va
// fino ai bordi, e il disegno sta nella zona sicura (l'80% centrale).
const maskable = icona
  .replace('rx="112"', 'rx="0"')
  .replace('<g id="disegno">', '<g id="disegno" transform="translate(256 256) scale(.78) translate(-256 -256)">')
if (maskable === icona) throw new Error('ciak.svg non ha più #sfondo e #disegno: la maskable non si può fare')

const uscite = [
  ['icon-192.png', icona, 192],
  ['icon-512.png', icona, 512],
  ['icon-maskable-512.png', maskable, 512],
  ['badge-96.png', leggi('badge.svg'), 96],
]

// Come in playwright.config.ts: un Chromium già installato si usa da lì.
const percorso = process.env.PLAYWRIGHT_CHROMIUM_PATH
const browser = await chromium.launch(percorso ? { executablePath: percorso } : {})
try {
  for (const [nome, svg, lato] of uscite) {
    const pagina = await browser.newPage({ viewport: { width: lato, height: lato }, deviceScaleFactor: 1 })
    const dati = Buffer.from(svg).toString('base64')
    await pagina.setContent(`<body style="margin:0;background:transparent"><img src="data:image/svg+xml;base64,${dati}" width="${lato}" height="${lato}" style="display:block"></body>`)
    await pagina.locator('img').evaluate((img) => img.decode())
    writeFileSync(new URL(nome, pub), await pagina.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: lato, height: lato } }))
    await pagina.close()
    console.log(`${nome} (${lato}×${lato})`)
  }
} finally {
  await browser.close()
}
