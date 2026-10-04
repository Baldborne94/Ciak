// I sottotitoli letti da Ciak invece che dal browser. Con le tracce dentro il
// <video> il browser mostra il suo pulsante CC nella barra in basso, con un
// menu che non si può spostare né ingrandire e che sul telefono finiva sotto i
// pulsanti di Ciak; nasconderlo via CSS funziona solo su alcuni Chrome. Senza
// tracce il pulsante non c'è, e le battute le disegna Ciak sopra il video.

// Dove sta una battuta nel riquadro. Quasi tutto è in basso; in alto vanno le
// scritte a schermo tradotte (cartelli, insegne, titoli), che in basso
// coprirebbero i dialoghi detti nello stesso momento.
export type Posizione = 'basso' | 'centro' | 'alto'

export interface Battuta {
  inizio: number // secondi
  fine: number
  testo: string
  posizione: Posizione
}

// Quello che si legge in un istante, diviso per posizione.
export type RigheInVista = Record<Posizione, string>

const TEMPO = /(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/
const RIGA_TEMPI = new RegExp(`${TEMPO.source}\\s*-->\\s*${TEMPO.source}`)

function secondi(ore: string | undefined, min: string, sec: string, ms: string): number {
  return Number(ore ?? 0) * 3600 + Number(min) * 60 + Number(sec) + Number(ms.padEnd(3, '0')) / 1000
}

// I tag di stile (<i>, <b>, <font>, <c.giallo>, le voci <v Tizio>) e quelli in
// stile ASS ({\an8}) si tolgono: si mostra il testo e basta. La posizione la
// legge `posizioneDi`, prima.
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

// La posizione dall'impostazione «line» di WebVTT (`line:0` è la prima riga
// dall'alto, `line:-1` l'ultima, `line:10%` vicino al bordo di sopra) o, se un
// file la porta ancora nel testo, dal tag ASS {\anN} (7 8 9 in alto, 4 5 6 a
// metà, come sul tastierino).
function posizioneDi(impostazioni: string, testo: string): Posizione {
  const ass = /\{\\[^}]*\ban([1-9])/.exec(testo)
  if (ass) return Number(ass[1]) >= 7 ? 'alto' : Number(ass[1]) >= 4 ? 'centro' : 'basso'
  const linea = /(?:^|\s)line:(-?\d+(?:\.\d+)?)(%?)/.exec(impostazioni)
  if (!linea) return 'basso'
  const valore = Number(linea[1])
  if (linea[2] === '%') return valore < 34 ? 'alto' : valore < 67 ? 'centro' : 'basso'
  return valore >= 0 ? 'alto' : 'basso'
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
    const grezze = righe.slice(i + 1)
    const parole = grezze.map(pulisci).filter(Boolean).join('\n')
    const posizione = posizioneDi(righe[i].slice(m.index + m[0].length), grezze.join('\n'))
    if (parole && fine > inizio) battute.push({ inizio, fine, testo: parole, posizione })
  }
  return battute.sort((a, b) => a.inizio - b.inizio)
}

// Cosa si legge al secondo `t`, posizione per posizione: due battute che si
// sovrappongono (due persone che parlano insieme) si mostrano una sopra
// l'altra; un cartello tradotto sta in alto mentre in basso si parla.
export function battuteAl(battute: Battuta[], t: number): RigheInVista {
  const attive: Record<Posizione, string[]> = { basso: [], centro: [], alto: [] }
  for (const b of battute) {
    if (b.inizio > t) break
    if (t < b.fine) attive[b.posizione].push(b.testo)
  }
  return { basso: attive.basso.join('\n'), centro: attive.centro.join('\n'), alto: attive.alto.join('\n') }
}
