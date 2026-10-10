# Strumenti per il PC

## Preparare i video per Ciak

`prepara-ciak.ps1` prende i video da una cartella del PC e li mette nella
cartella Ciak di Google Drive già pronti per il lettore di Ciak: MP4 con video
H.264, audio AAC (il Dolby il browser non lo sente; le tracce già AAC si
copiano) e i sottotitoli interni italiani e inglesi estratti in `.srt` accanto
al video — le altre lingue il lettore non le offre. Quando per una lingua ci
sono più tracce, vince quella con i dialoghi: le «forced» e quelle che si
chiamano «Signs & Songs» (solo cartelli e canzoni) si scartano, e fra le altre
si preferisce quella con più battute. La conversione avviene sul disco del PC e
su Drive va solo il risultato, una volta.

**Una volta sola**

1. Installa ffmpeg: `winget install --id Gyan.FFmpeg -e`, poi chiudi e riapri
   le finestre del prompt.
2. Scarica `prepara-ciak.ps1` e `prepara-ciak.bat` nella **stessa cartella**,
   fuori da Google Drive (per esempio `E:\Intrattenimento`).

**Ogni volta**

1. Metti i video in `E:\Intrattenimento`, con le stesse sottocartelle di Ciak:
   `FILM\`, `SERIE TV\South Park\Season 01\`, `ANIME\`, `CARTONI\`…
2. Doppio clic su `prepara-ciak.bat`.

I video già presenti su Drive si saltano: si può rilanciare quando si vuole.

### Le lingue dell'audio

Chrome e Firefox di un MP4 suonano solo la prima traccia audio: il doppiaggio
italiano di un anime giapponese, o l'originale inglese di un film doppiato,
resterebbero muti. Per questo lo script salva ogni traccia oltre la prima in un
file a parte accanto al video (`Film.audio-2.m4a`), più un elenco delle lingue
(`Film.audio.json`), e il lettore di Ciak le offre nel menu **Audio**. Le
tracce si copiano così come sono: un film con due lingue occupa su Drive quanto
prima, più la seconda lingua.

Per i video **già su Drive** c'è `tracce-audio.bat`: scaricalo nella stessa
cartella di `prepara-ciak.ps1` e fai doppio clic. Guarda uno per uno i video di
`G:\Il mio Drive\Ciak` che non hanno ancora l'elenco e prepara le lingue in
più; quelli con una lingua sola li segna come guardati e basta. Drive per
desktop deve scaricare ogni video per leggerlo, quindi la prima volta ci vuole
un po': si può chiudere quando si vuole e rilanciare, riparte da dove era.

### Lo stesso film in un'altra lingua

Un film scaricato anche in italiano (o in inglese) non va su Drive due volte:
lo script se ne accorge, ne prende solo l'audio e lo aggiunge come lingua al
film che c'è già, nel menu **Audio** di Ciak. Basta metterlo in
`E:\Intrattenimento` come ogni altro video. Riconosce lo stesso film dal
titolo e dall'anno nel nome del file (`Inception.2010.1080p.mkv` e
`Inception (2010) ITA.mkv`), lo stesso episodio da serie e sigla
(`S03E01`). Se le due versioni arrivano insieme, va su Drive come video la più
grande (di solito la qualità migliore) e l'altra ne diventa una lingua.

Le due versioni quasi mai combaciano al secondo: loghi diversi all'inizio, e
le copie europee vanno a 25 fotogrammi invece di 23,976 (il 4% più veloci).
Lo script misura lo scarto confrontando musica ed effetti, che sono uguali in
tutte le lingue, in cinque punti del film, e rimette l'audio a tempo. Se i
cinque punti non sono d'accordo le versioni sono montate in modo diverso (una
«Extended», una scena tagliata): la lingua non si aggiunge, perché sarebbe
fuori sincrono, e lo script lo dice.

Quando i nomi non si somigliano (`Il.Padrino.1972.mkv` e
`The.Godfather.1972.mp4`) c'è `aggiungi-lingua.bat`: scaricalo nella stessa
cartella di `prepara-ciak.ps1` e **trascinaci sopra** il video con la lingua
da aggiungere. Propone i film su Drive che gli somigliano (anche solo per
anno), o si cerca scrivendo una parola del titolo; alla fine chiede se
cancellare il file, che ormai non serve più. Se il file non dice di che lingua
è l'audio e non lo dice nemmeno il nome, lo chiede.

Un video con dei pezzi mancanti (un torrent non finito: il file è già lungo
quanto quello completo, ma dove i dati non sono arrivati ci sono solo zeri)
non si converte: ffmpeg lo farebbe lo stesso, con salti e immagini rotte
(«invalid as first byte of an EBML number», «Could not find ref with POC»).
Lo script lo dice, lascia l'originale dov'è e passa al successivo: in
qBittorrent, tasto destro sul torrent → **Forza ricontrollo**, e quando è al
100% si rilancia.

Su Drive va solo il film: gli scarti delle release si saltano. Sono le
anteprime (`….Sample.mp4`), i promo di pochi MB del gruppo che ha fatto la
release (`ETRG.mp4`, sotto i 5 MB) e le cartelle degli extra (`Featurettes`,
`Trailers`, `Samples`…). Gli `Extras` e gli speciali delle serie restano: sono
la stagione 0. Quando il film della stessa cartella è fatto, gli scarti si
cancellano con l'originale. Quelli già finiti su Drive Ciak li nasconde.

**Gli originali si cancellano definitivamente** (niente Cestino) appena la
copia su Drive è controllata: deve durare quanto l'originale. Con loro se ne
vanno i `.srt` che su Drive ci sono già e le sottocartelle rimaste vuote
(`Season 01`, la serie); quelle di primo livello (`FILM`, `SERIE TV`…) restano.
Al primo lancio vale anche per i video caricati nei giri precedenti. Non si
cancella:

- un originale la cui copia su Drive è più corta o illeggibile (di prima dei
  controlli sulla durata): lo script lo dice alla fine; cancella la copia su
  Drive e rilancia per rifarla;
- un file aperto da un altro programma, per esempio qBittorrent che lo sta
  ancora condividendo: si riprova al lancio successivo;
- un file scritto negli ultimi minuti.

Per tenere gli originali:
`powershell -ExecutionPolicy Bypass -File prepara-ciak.ps1 -TieniOriginali`.

Il file finisce in `G:\Il mio Drive`, cioè nella copia locale di Google Drive
per desktop, che lo carica da sé: lascia Drive aperto finché l'icona non dice
che è tutto sincronizzato, prima di spegnere il PC.

Un video che non è già H.264 a 8 bit (HEVC, 10 bit…) va ricodificato: con la
scheda video (NVIDIA, Intel o AMD, scelta da sola all'avvio) ci vuole una
frazione del tempo rispetto alla CPU, che resta il ripiego. Un file che la
scheda video non riesce a fare viene rifatto con la CPU.

Un video HDR (HDR10, HLG, Dolby Vision con base HDR10) ricodificato così com'è
sul tablet apparirebbe slavato: lo script ne ricalcola i colori per uno
schermo normale (tone mapping con `zscale`, presente nella build di ffmpeg
installata con winget). Il Dolby Vision profilo 5, comune nei WEB-DL «DV», non
si può convertire bene (colori verdi e viola): lo script lo lascia dov'è e
chiede un'altra versione.

Potendo scegliere cosa scaricare, conviene **x264 / H.264 a 1080p, senza HDR**:
il video si copia in pochi secondi invece di essere ricodificato, e non perde
qualità.

I controlli, perché su Drive non finisca un video rotto (che poi lo script
salterebbe per sempre, credendolo già fatto):

- un file scritto negli ultimi 5 minuti è probabilmente ancora in download: si
  salta e lo si prende al lancio successivo. Meglio ancora, in qBittorrent
  attiva *Opzioni → Download → Aggiungi l'estensione .!qB ai file incompleti*:
  così lo script non li vede proprio finché non sono finiti;
- prima di convertire si leggono i primi secondi: un file danneggiato
  (`Invalid NAL unit size`, `moov atom not found`) è un errore, non un MP4
  vuoto;
- dopo, il video creato deve durare quanto l'originale: un download a metà
  si ferma dove finiscono i dati, e ne uscirebbe un film di pochi minuti.

Alla fine lo script ripete tutti gli errori e li salva in
`prepara-ciak-errori.txt` accanto a sé. Un `moov atom not found` o un video
«più corto dell'originale» quasi sempre è un download non finito: lascia che
finisca (o *Forza ricontrollo* nel client torrent) e rilancia. Se il download è
completo e VLC lo apre, di solito basta rifarne il contenitore:
`ffmpeg -i "file" -map 0 -c copy riparato.mkv`.

Per cartelle diverse, o per forzare un encoder (`-Encoder libx264` per la CPU):

```
powershell -ExecutionPolicy Bypass -File prepara-ciak.ps1 -Origine "D:\Video" -Destinazione "G:\Il mio Drive\Ciak"
```
