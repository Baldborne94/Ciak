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
