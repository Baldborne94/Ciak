# Strumenti per il PC

## Preparare i video per Ciak

`prepara-ciak.ps1` prende i video da una cartella del PC e li mette nella
cartella Ciak di Google Drive già pronti per il lettore di Ciak: MP4 con video
H.264, audio AAC (il Dolby il browser non lo sente) e i sottotitoli interni
estratti in `.srt` accanto al video. La conversione avviene sul disco del PC e
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
Gli originali restano dove sono.

Un video che non è già H.264 a 8 bit (HEVC, 10 bit…) va ricodificato: con la
scheda video (NVIDIA, Intel o AMD, scelta da sola all'avvio) ci vuole una
frazione del tempo rispetto alla CPU, che resta il ripiego. Un file che la
scheda video non riesce a fare viene rifatto con la CPU.

Per cartelle diverse, o per forzare un encoder (`-Encoder libx264` per la CPU):

```
powershell -ExecutionPolicy Bypass -File prepara-ciak.ps1 -Origine "D:\Video" -Destinazione "G:\Il mio Drive\Ciak"
```
