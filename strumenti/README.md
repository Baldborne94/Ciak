# Strumenti per il PC

## Preparare i video per Ciak

La videoteca sta sul disco esterno, in `E:\Ciak`: è la cartella che colleghi
in Ciak (*Streaming* → «📂 Collega la cartella dei film») e che legge Jellyfin. I video
nuovi non si mettono lì direttamente: vanno in **`E:\Da preparare`**, e
`prepara-ciak` li converte e li sposta in `E:\Ciak` già pronti per il lettore
di Ciak.

Pronti vuol dire: MP4 con video H.264, audio AAC (il Dolby il browser non lo
sente; le tracce già AAC si copiano) e i sottotitoli interni italiani e
inglesi estratti in `.srt` accanto al video — le altre lingue il lettore non
le offre. I sottotitoli in immagine (i PGS dei Blu-ray, i VobSub dei DVD) non
diventano testo: lo script lo dice, e per quel video serve un `.srt` da mettere
accanto (`Nome del video.it.srt`), che Ciak trova da solo. Quando per una lingua ci sono più tracce, vince quella con i
dialoghi: le «forced» e quelle che si chiamano «Signs & Songs» (solo cartelli
e canzoni) si scartano, e fra le altre si preferisce quella con più battute.
Il video si scrive prima nella cartella temporanea del PC e in `E:\Ciak`
arriva solo finito: un file a metà Ciak lo vedrebbe come un film rotto.

**Una volta sola**

1. Installa ffmpeg: `winget install --id Gyan.FFmpeg -e`, poi chiudi e riapri
   le finestre del prompt.
2. Scarica `prepara-ciak.ps1` e `prepara-ciak.bat` nella **stessa cartella**,
   per esempio in `E:\Ciak` accanto alle schede (Ciak mostra solo i video, gli
   script non li vede).
3. Doppio clic su `prepara-ciak.bat`: la prima volta crea `E:\Da preparare`
   con le stesse cartelle di Ciak (`FILM`, `SERIE TV`, `ANIME`…) e si ferma.

**Ogni volta**

1. Metti i video in `E:\Da preparare`, già al loro posto: `FILM\`,
   `SERIE TV\South Park\Season 01\`, `ANIME\`, `CARTONI\`… La cartella
   diventa la scheda e la serie in Ciak, uguale in `E:\Ciak`.
2. Doppio clic su `prepara-ciak.bat`. All'avvio scrive da dove a dove lavora
   («Da: E:\Da preparare», «A: E:\Ciak»).
3. In Ciak, *Streaming* → «🔄 Aggiorna».

Lo script trova da solo la cartella `Ciak` in radice del disco esterno (se ce
l'hanno due dischi, vince quello da cui lo lanci). Se non la trova, il disco
non è attaccato: lo dice e si ferma. I video già presenti in Ciak si saltano:
si può rilanciare quando si vuole.

### Le lingue dell'audio

Chrome e Firefox di un MP4 suonano solo la prima traccia audio: il doppiaggio
italiano di un anime giapponese, o l'originale inglese di un film doppiato,
resterebbero muti. Per questo lo script salva ogni traccia oltre la prima in un
file a parte accanto al video (`Film.audio-2.m4a`), più un elenco delle lingue
(`Film.audio.json`), e il lettore di Ciak le offre nel menu **Audio**. Le
tracce si copiano così come sono: un film con due lingue occupa sul disco
quanto prima, più la seconda lingua.

Per i video **già in Ciak** c'è `tracce-audio.bat`: scaricalo nella stessa
cartella di `prepara-ciak.ps1` e fai doppio clic. Guarda uno per uno i video di
`E:\Ciak` che non hanno ancora l'elenco e prepara le lingue in più; quelli con
una lingua sola li segna come guardati e basta. Per leggere un video lo legge
tutto, quindi la prima volta ci vuole un po': si può chiudere quando si vuole e
rilanciare, riparte da dove era.

### Lo stesso film in un'altra lingua

Un film scaricato anche in italiano (o in inglese) non entra in Ciak due volte:
lo script se ne accorge, ne prende solo l'audio e lo aggiunge come lingua al
film che c'è già, nel menu **Audio** di Ciak. Basta metterlo in
`E:\Da preparare` come ogni altro video. Riconosce lo stesso film dal
titolo e dall'anno nel nome del file (`Inception.2010.1080p.mkv` e
`Inception (2010) ITA.mkv`), lo stesso episodio da serie e sigla
(`S03E01`). Se le due versioni arrivano insieme, entra in Ciak come video la più
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
da aggiungere. Propone i film di Ciak che gli somigliano (anche solo per
anno), o si cerca scrivendo una parola del titolo (con `-CancellaOriginali`,
alla fine chiede se cancellare il file, che ormai non serve più). Se il file non dice di che lingua
è l'audio e non lo dice nemmeno il nome, lo chiede.

Un video con dei pezzi mancanti (un torrent non finito: il file è già lungo
quanto quello completo, ma dove i dati non sono arrivati ci sono solo zeri)
non si converte: ffmpeg lo farebbe lo stesso, con salti e immagini rotte
(«invalid as first byte of an EBML number», «Could not find ref with POC»).
Lo script lo dice, lascia l'originale dov'è e passa al successivo: in
qBittorrent, tasto destro sul torrent → **Forza ricontrollo**, e quando è al
100% si rilancia.

In Ciak va solo il film: gli scarti delle release si saltano. Sono le
anteprime (`….Sample.mp4`), i promo di pochi MB del gruppo che ha fatto la
release (`ETRG.mp4`, sotto i 5 MB) e le cartelle degli extra (`Featurettes`,
`Trailers`, `Samples`…). Gli `Extras` e gli speciali delle serie restano: sono
la stagione 0, e quelli di un film l'app li nasconde.

**Gli originali restano dove sono**, sul disco, in `E:\Da preparare` dove li
hai scaricati: lo script li legge e scrive la copia in `E:\Ciak`, e niente va
altrove (né su Google Drive né in altri servizi). Rilanciandolo, i video già in
Ciak si saltano.

Per liberare spazio, si possono far cancellare gli originali appena la copia in
Ciak è controllata (deve durare quanto l'originale):
`powershell -ExecutionPolicy Bypass -File prepara-ciak.ps1 -CancellaOriginali`.
Si cancellano **definitivamente** (niente Cestino), con i `.srt` che in Ciak ci
sono già, gli scarti della release e le sottocartelle rimaste vuote (`Season
01`, la serie); quelle di primo livello (`FILM`, `SERIE TV`…) restano. Non si
cancella:

- un originale la cui copia in Ciak è più corta o illeggibile: lo script lo
  dice alla fine; cancella la copia in `E:\Ciak` e rilancia per rifarla;
- un file aperto da un altro programma, per esempio qBittorrent che lo sta
  ancora condividendo: si riprova al lancio successivo;
- un file scritto negli ultimi minuti.

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

I controlli, perché in Ciak non finisca un video rotto (che poi lo script
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

Le due cartelle devono essere separate, una non dentro l'altra: lo script si
rifiuta, perché un video già in Ciak sembrerebbe un originale da cancellare.
Per cartelle diverse, o per forzare un encoder (`-Encoder libx264` per la CPU):

```
powershell -ExecutionPolicy Bypass -File prepara-ciak.ps1 -Origine "D:\Video" -Destinazione "F:\Ciak"
```

## Il server di casa: i film del disco anche sul tablet

La cartella collegata funziona sul PC a cui è attaccato il disco. Per vedere
gli stessi film dal tablet o dal telefono, anche fuori casa, serve un server:
**Jellyfin** (gratuito) li manda a Ciak, e **Tailscale** (gratuito) li fa
arrivare anche fuori casa, in modo sicuro, senza aprire niente su internet.
In Ciak non cambia niente: videoteca, saghe, diario, «riprendi da dove eri»,
sottotitoli e menu Audio restano gli stessi. In più Jellyfin converte da sé i
formati che il browser non legge (MKV, HEVC, Dolby): `prepara-ciak` diventa
facoltativo, ma con gli MP4 H.264 il PC lavora meno e il film parte subito.

Il PC deve essere acceso (e Jellyfin aperto) mentre guardi: in *Impostazioni
→ Sistema → Alimentazione* metti «Sospensione: mai» quando è collegato alla
corrente.

**1. Jellyfin sul PC**

1. Scarica *Jellyfin Server* per Windows da jellyfin.org (Downloads →
   Windows) e installalo.
2. Si apre la configurazione nel browser: lingua italiana, un utente e una
   password (quelli che scriverai in Ciak).
3. Aggiungi una **libreria per cartella** del disco: «Film» → `E:\Ciak\FILM`
   (tipo *Film*), «Serie TV» → `E:\Ciak\SERIE TV` (tipo *Programmi TV*), e così
   `ANIME` e `CARTONI`. Il nome della cartella diventa la scheda della
   videoteca di Ciak, come con la cartella collegata.
4. Facoltativo, per i sottotitoli che mancano: *Pannello di controllo →
   Plugin → Catalogo → Open Subtitles*, poi nelle librerie spunta italiano e
   inglese fra le lingue da scaricare.

**2. Tailscale (per collegarsi in HTTPS, anche fuori casa)**

Ciak è un sito in HTTPS e il browser non lo lascia parlare con un server in
HTTP: Tailscale dà a Jellyfin un indirizzo HTTPS valido.

1. Installa Tailscale (tailscale.com/download) sul PC **e** sul tablet (e sul
   telefono), entrando con lo stesso account.
2. Nella console di Tailscale (login.tailscale.com → *DNS*) attiva *MagicDNS* e
   *HTTPS Certificates*.
3. Sul PC apri il *Prompt dei comandi* e scrivi:
   `tailscale serve --bg 8096`
   Risponde con l'indirizzo, qualcosa come `https://pc-di-casa.tail1234.ts.net`.

**3. In Ciak**

*Streaming* → «🏠 Collega il server di casa»: l'indirizzo di Tailscale, utente
e password di Jellyfin. Si fa una volta per dispositivo; Ciak tiene solo un
token, che dal Pannello di controllo di Jellyfin (*Dispositivi*) si toglie
quando vuoi. Se Chrome chiede di consentire l'accesso ai dispositivi della
rete locale, rispondi «Consenti».

Con la cartella collegata e il server di casa insieme, la videoteca mostra i
film di tutti e due: lo stesso file nei due posti compare una volta, quello
del server.

Dal server di casa, per ora, non c'è «Cancella dal disco»: i film si
cancellano dal PC (Esplora file, o Ciak con solo la cartella collegata), poi
«🔄 Aggiorna».
