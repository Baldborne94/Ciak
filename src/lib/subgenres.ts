// Sottogeneri curati per genere TMDB.
//
// TMDB non ha un concetto di sottogenere: ha ~19 generi grossolani e migliaia di
// "keyword" (etichette come "anti-war", "slasher", "cyberpunk"). I sottogeneri
// qui sotto sono quindi coppie «etichetta italiana → keyword TMDB»: l'etichetta
// è ciò che legge l'utente, le keyword sono ciò che chiediamo a /discover.
//
// Più keyword per lo stesso sottogenere sono in OR: "Seconda guerra mondiale"
// pesca sia "world war ii" sia "wwii", perché i titoli non sono etichettati in
// modo uniforme e con una sola keyword si perderebbero risultati.

export interface Subgenre {
  label: string
  keywords: string[]
}

// Id dei generi TMDB (film e serie hanno liste diverse ma id condivisi dove il
// genere esiste in entrambe).
const AZIONE = 28
const AVVENTURA = 12
const ANIMAZIONE = 16
const COMMEDIA = 35
const CRIME = 80
const DOCUMENTARIO = 99
const DRAMMA = 18
const FAMIGLIA = 10751
const FANTASY = 14
const STORIA = 36
const HORROR = 27
const MUSICA = 10402
const MISTERO = 9648
const ROMANCE = 10749
const FANTASCIENZA = 878
const THRILLER = 53
const GUERRA = 10752
const WESTERN = 37
// Generi solo-serie
const TV_AZIONE_AVVENTURA = 10759
const TV_SCIFI_FANTASY = 10765
const TV_GUERRA_POLITICA = 10768
const TV_KIDS = 10762

const GUERRA_SUB: Subgenre[] = [
  { label: 'Antimilitarista', keywords: ['anti-war', 'antiwar'] },
  { label: 'Seconda guerra mondiale', keywords: ['world war ii', 'wwii'] },
  { label: 'Prima guerra mondiale', keywords: ['world war i', 'wwi'] },
  { label: 'Vietnam', keywords: ['vietnam war'] },
  { label: 'Resistenza', keywords: ['resistance', 'partisan'] },
  { label: 'Prigionieri di guerra', keywords: ['prisoner of war'] },
  { label: 'Olocausto', keywords: ['holocaust'] },
  { label: 'Guerra fredda', keywords: ['cold war'] },
]

const FANTASCIENZA_SUB: Subgenre[] = [
  { label: 'Cyberpunk', keywords: ['cyberpunk'] },
  { label: 'Viaggi nel tempo', keywords: ['time travel'] },
  { label: 'Space opera', keywords: ['space opera'] },
  { label: 'Distopia', keywords: ['dystopia'] },
  { label: 'Post-apocalittico', keywords: ['post-apocalyptic'] },
  { label: 'Invasione aliena', keywords: ['alien invasion'] },
  { label: 'Intelligenza artificiale', keywords: ['artificial intelligence'] },
  { label: 'Robot', keywords: ['robot'] },
  { label: 'Primo contatto', keywords: ['first contact'] },
]

const FANTASY_SUB: Subgenre[] = [
  { label: 'Spade e stregoneria', keywords: ['sword and sorcery'] },
  { label: 'Fiaba', keywords: ['fairy tale'] },
  { label: 'Magia', keywords: ['magic'] },
  { label: 'Draghi', keywords: ['dragon'] },
  { label: 'Mitologia', keywords: ['mythology'] },
  { label: 'Urban fantasy', keywords: ['urban fantasy'] },
]

const AZIONE_SUB: Subgenre[] = [
  { label: 'Arti marziali', keywords: ['martial arts'] },
  { label: 'Kung fu', keywords: ['kung fu'] },
  { label: 'Supereroi', keywords: ['superhero'] },
  { label: 'Spionaggio', keywords: ['espionage', 'spy'] },
  { label: 'Vendetta', keywords: ['revenge'] },
  { label: 'Inseguimenti', keywords: ['car chase'] },
  { label: 'Rapina', keywords: ['heist'] },
]

export const SUBGENRES: Record<number, Subgenre[]> = {
  [GUERRA]: GUERRA_SUB,
  [TV_GUERRA_POLITICA]: [
    { label: 'Politica', keywords: ['politics'] },
    { label: 'Spionaggio', keywords: ['espionage', 'spy'] },
    ...GUERRA_SUB,
  ],
  [HORROR]: [
    { label: 'Slasher', keywords: ['slasher'] },
    { label: 'Zombie', keywords: ['zombie'] },
    { label: 'Casa infestata', keywords: ['haunted house'] },
    { label: 'Possessione', keywords: ['possession', 'exorcism'] },
    { label: 'Vampiri', keywords: ['vampire'] },
    { label: 'Licantropi', keywords: ['werewolf'] },
    { label: 'Found footage', keywords: ['found footage'] },
    { label: 'Folk horror', keywords: ['folk horror'] },
    { label: 'Body horror', keywords: ['body horror'] },
    { label: 'Creature', keywords: ['monster', 'creature'] },
    { label: 'Sopravvivenza', keywords: ['survival horror', 'survival'] },
  ],
  [FANTASCIENZA]: FANTASCIENZA_SUB,
  [TV_SCIFI_FANTASY]: [...FANTASCIENZA_SUB, ...FANTASY_SUB],
  [FANTASY]: FANTASY_SUB,
  [AZIONE]: AZIONE_SUB,
  [TV_AZIONE_AVVENTURA]: AZIONE_SUB,
  [THRILLER]: [
    { label: 'Psicologico', keywords: ['psychological thriller'] },
    { label: 'Serial killer', keywords: ['serial killer'] },
    { label: 'Cospirazione', keywords: ['conspiracy'] },
    { label: 'Spionaggio', keywords: ['espionage', 'spy'] },
    { label: 'Rapina', keywords: ['heist'] },
    { label: 'Ostaggi', keywords: ['hostage'] },
  ],
  [CRIME]: [
    { label: 'Gangster', keywords: ['gangster'] },
    { label: 'Mafia', keywords: ['mafia'] },
    { label: 'Noir', keywords: ['film noir', 'neo-noir'] },
    { label: 'Detective', keywords: ['detective'] },
    { label: 'Rapina', keywords: ['heist'] },
    { label: 'Carcere', keywords: ['prison'] },
    { label: 'Narcotraffico', keywords: ['drug cartel', 'drug trafficking'] },
    { label: 'True crime', keywords: ['true crime'] },
  ],
  [MISTERO]: [
    { label: 'Giallo classico', keywords: ['whodunit'] },
    { label: 'Investigatore privato', keywords: ['private detective'] },
    { label: 'Sparizione', keywords: ['missing person'] },
    { label: 'Caso irrisolto', keywords: ['cold case'] },
    { label: 'Soprannaturale', keywords: ['supernatural'] },
  ],
  [COMMEDIA]: [
    { label: 'Commedia nera', keywords: ['black comedy', 'dark comedy'] },
    { label: 'Commedia romantica', keywords: ['romantic comedy'] },
    { label: 'Parodia', keywords: ['parody', 'spoof'] },
    { label: 'Mockumentary', keywords: ['mockumentary'] },
    { label: 'Satira', keywords: ['satire'] },
    { label: 'Slapstick', keywords: ['slapstick'] },
    { label: 'Buddy comedy', keywords: ['buddy comedy'] },
  ],
  [DRAMMA]: [
    { label: 'Romanzo di formazione', keywords: ['coming of age'] },
    { label: 'Tribunale', keywords: ['courtroom', 'trial'] },
    { label: 'Biografico', keywords: ['biography'] },
    { label: 'Malattia', keywords: ['illness', 'terminal illness'] },
    { label: 'Famiglia disfunzionale', keywords: ['dysfunctional family'] },
    { label: 'Tratto da una storia vera', keywords: ['based on true story'] },
    { label: 'Sportivo', keywords: ['sport', 'sports'] },
  ],
  [ROMANCE]: [
    { label: 'Triangolo amoroso', keywords: ['love triangle'] },
    { label: 'Amore proibito', keywords: ['forbidden love'] },
    { label: 'Da amici ad amanti', keywords: ['friends to lovers'] },
    { label: 'Matrimonio', keywords: ['wedding'] },
    { label: 'Storia d’epoca', keywords: ['period drama'] },
  ],
  [STORIA]: [
    { label: 'Antica Roma', keywords: ['ancient rome'] },
    { label: 'Medioevo', keywords: ['middle ages', 'medieval'] },
    { label: 'Rivoluzione', keywords: ['revolution'] },
    { label: 'Guerra civile', keywords: ['civil war'] },
    { label: 'Biografia storica', keywords: ['historical figure', 'biography'] },
  ],
  [ANIMAZIONE]: [
    { label: 'Anime', keywords: ['anime'] },
    { label: 'Stop motion', keywords: ['stop motion'] },
    { label: 'Per adulti', keywords: ['adult animation'] },
    { label: 'Musicale', keywords: ['musical'] },
    { label: 'Supereroi', keywords: ['superhero'] },
  ],
  [AVVENTURA]: [
    { label: 'Caccia al tesoro', keywords: ['treasure hunt'] },
    { label: 'Sopravvivenza', keywords: ['survival'] },
    { label: 'Pirati', keywords: ['pirate'] },
    { label: 'Esplorazione', keywords: ['exploration', 'expedition'] },
    { label: 'Giungla', keywords: ['jungle'] },
    { label: 'Alta montagna', keywords: ['mountain climbing'] },
  ],
  [DOCUMENTARIO]: [
    { label: 'True crime', keywords: ['true crime'] },
    { label: 'Natura', keywords: ['nature', 'wildlife'] },
    { label: 'Musica', keywords: ['music', 'musician'] },
    { label: 'Sport', keywords: ['sport', 'sports'] },
    { label: 'Politica', keywords: ['politics'] },
    { label: 'Biografico', keywords: ['biography'] },
  ],
  [WESTERN]: [
    { label: 'Spaghetti western', keywords: ['spaghetti western'] },
    { label: 'Revisionista', keywords: ['revisionist western'] },
    { label: 'Cacciatori di taglie', keywords: ['bounty hunter'] },
    { label: 'Nativi americani', keywords: ['native american'] },
  ],
  [MUSICA]: [
    { label: 'Musical', keywords: ['musical'] },
    { label: 'Biopic musicale', keywords: ['musician', 'singer'] },
    { label: 'Concerto', keywords: ['concert'] },
    { label: 'Rock', keywords: ['rock music'] },
  ],
  [FAMIGLIA]: [
    { label: 'Animali', keywords: ['animal', 'dog'] },
    { label: 'Natale', keywords: ['christmas'] },
    { label: 'Scuola', keywords: ['school'] },
    { label: 'Amicizia', keywords: ['friendship'] },
  ],
  [TV_KIDS]: [
    { label: 'Scuola', keywords: ['school'] },
    { label: 'Animali', keywords: ['animal'] },
    { label: 'Amicizia', keywords: ['friendship'] },
  ],
}

// I sottogeneri disponibili per un genere (lista vuota se non ne abbiamo curati).
export function subgenresFor(genreId: number): Subgenre[] {
  return SUBGENRES[genreId] ?? []
}

// Cerca un sottogenere per etichetta dentro un genere: serve a ricostruire lo
// stato da un parametro dell'URL o dalla cache di navigazione.
export function findSubgenre(genreId: number, label: string): Subgenre | undefined {
  return subgenresFor(genreId).find((s) => s.label === label)
}
