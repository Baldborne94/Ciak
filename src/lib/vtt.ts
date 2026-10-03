// I sottotitoli letti da Ciak invece che dal browser. Con le tracce dentro il
// <video> il browser mostra il suo pulsante CC nella barra in basso, con un
// menu che non si può spostare né ingrandire e che sul telefono finiva sotto i
// pulsanti di Ciak; nasconderlo via CSS funziona solo su alcuni Chrome. Senza
// tracce il pulsante non c'è, e le battute le disegna Ciak sopra il video.

export interface Battuta {
  inizio: number // secondi
  fine: number
  testo: string
}

const TEMPO = /(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/
const RIGA_TEMPI = new RegExp(`${TEMPO.source}\\s*-->\\s*${TEMPO.source}`)

function secondi(ore: string | undefined, min: string, sec: string, ms: string): number {
  return Number(ore ?? 0) * 3600 + Number(min) * 60 + Number(sec) + Number(ms.padEnd(3, '0')) / 1000
}

// I tag di stile (<i>, <b>, <font>, <c.giallo>, le voci <v Tizio>) e quelli di
// posizione in stile ASS ({\an8}) si tolgono: si mostra il testo e basta.
function pulisci(riga: string): string {
  return riga
    .replace(/<[^>]*>/g, '')
    .replace(/\{\\[^}]*\}/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .trim()
}

// WebVTT (anche da SRT, vedi `srtAVtt`) → battute in ordine di inizio. I
// blocchi NOTE, STYLE e REGION non hanno una riga di tempi e si saltano da soli.
export function leggiVtt(testo: string): Battuta[] {
  const battute: Battuta[] = []
  const blocchi = testo.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split(/\n{2,}/)
  for (const blocco of blocchi) {
    const righe = blocco.split('\n')
    const i = righe.findIndex((r) => RIGA_TEMPI.test(r))
    if (i < 0) continue
    const m = RIGA_TEMPI.exec(righe[i])!
    const inizio = secondi(m[1], m[2], m[3], m[4])
    const fine = secondi(m[5], m[6], m[7], m[8])
    const parole = righe
      .slice(i + 1)
      .map(pulisci)
      .filter(Boolean)
      .join('\n')
    if (parole && fine > inizio) battute.push({ inizio, fine, testo: parole })
  }
  return battute.sort((a, b) => a.inizio - b.inizio)
}

// Cosa si legge al secondo `t`: due battute che si sovrappongono (due persone
// che parlano insieme) si mostrano una sopra l'altra.
export function battuteAl(battute: Battuta[], t: number): string {
  const attive: string[] = []
  for (const b of battute) {
    if (b.inizio > t) break
    if (t < b.fine) attive.push(b.testo)
  }
  return attive.join('\n')
}
