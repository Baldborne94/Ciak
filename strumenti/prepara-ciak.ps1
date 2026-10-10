# Prepara i video per Ciak.
#
# Prende i video da una cartella del PC (di solito E:\Intrattenimento) e li
# mette nella cartella Ciak di Google Drive gia' pronti per il lettore di Ciak:
#   - MP4 con l'indice all'inizio (+faststart), cosi' parte subito e si salta;
#   - video H.264 a 8 bit, l'unico che ogni browser e ogni tablet legge: se lo
#     e' gia' si copia (pochi secondi), altrimenti si ricodifica (lento);
#   - tutte le tracce audio in AAC: Dolby (AC3/E-AC3) e DTS il browser non li
#     sente, e il video partirebbe muto; quelle gia' in AAC si copiano;
#   - i sottotitoli dentro il file (SRT, ASS) estratti in .srt accanto al video,
#     solo italiano e inglese, con la lingua nel nome (Film.it.srt,
#     Film.en.srt), dove Ciak li trova;
#   - i .srt gia' accanto al video originale, copiati.
# Un video che non si legge, o che esce molto piu' corto dell'originale (ancora
# in download, danneggiato), non va su Drive: finisce nell'elenco degli errori
# che lo script stampa alla fine e salva in prepara-ciak-errori.txt.
# La conversione si fa sul disco del PC e solo il risultato va su Drive: un
# file letto e riscritto direttamente su Drive va scaricato e ricaricato
# intero, ed e' quello che rendeva tutto lentissimo.
#
# Gli scarti delle release non vanno su Drive: le anteprime ("...Sample.mp4"),
# i video promozionali di pochi MB del gruppo che ha fatto la release
# ("ETRG.mp4") e gli extra dei film (Featurettes, Trailers, Samples...). Su
# Drive va solo il film. Quando il film della stessa cartella e' fatto, gli
# scarti si cancellano con l'originale (non con -TieniOriginali).
#
# Le sottocartelle si ricopiano uguali (FILM, SERIE TV\South Park\Season 01...):
# sono le schede e le serie di Ciak. I video gia' presenti su Drive si saltano,
# quindi si puo' rilanciare quando si vuole: fa solo quelli nuovi.
#
# Gli originali, una volta che la copia su Drive e' intera (dura quanto
# l'originale), si cancellano definitivamente insieme ai loro .srt, cosi' il
# disco non si riempie. -TieniOriginali li lascia dove sono.
#
# Le lingue dell'audio: il browser suona solo la prima traccia di un MP4 e
# non lascia passare alle altre. Le altre si salvano accanto al video, una per
# file (Film.audio-2.m4a, ...), con l'elenco di tutte in Film.audio.json: il
# lettore di Ciak le offre nel menu Audio. -SoloTracceAudio le prepara per i
# video gia' su Drive (lancialo con tracce-audio.bat).
#
# Lo stesso film scaricato in due lingue non va su Drive due volte: se un
# video ha lo stesso titolo e anno (o la stessa serie ed episodio) di uno gia'
# su Drive, se ne prende solo l'audio, rimesso a tempo, e diventa una lingua
# in piu' del primo. Per i nomi che non si somigliano ("Il Padrino" e "The
# Godfather") c'e' aggiungi-lingua.bat: ci si trascina sopra il video e si
# sceglie il film.
#
# Il file e' scritto senza lettere accentate apposta: Windows PowerShell legge
# gli script senza BOM come ANSI, e una "e'" accentata diventerebbe illeggibile.

param(
  [string]$Origine = 'E:\Intrattenimento',
  [string]$Destinazione = 'G:\Il mio Drive\Ciak',
  # 'auto' prova la scheda video (NVIDIA, Intel, AMD) e ripiega sulla CPU;
  # si puo' forzare un encoder, per esempio -Encoder libx264.
  [string]$Encoder = 'auto',
  # Un file scritto da meno minuti di cosi' e' probabilmente ancora in download.
  [int]$MinutiDiCalma = 5,
  # Lascia gli originali dove sono invece di cancellarli.
  [switch]$TieniOriginali,
  # Non converte niente: prepara le tracce audio dei video gia' su Drive.
  [switch]$SoloTracceAudio,
  # Non converte niente: aggiunge l'audio di questo video, come lingua in piu',
  # al film gia' su Drive (lancialo con aggiungi-lingua.bat). -Film dice quale
  # film senza chiederlo; -LinguaNuova la lingua, se il file non la dice.
  [string]$AggiungiLingua,
  [string]$Film,
  [string]$LinguaNuova
)

$ErrorActionPreference = 'Stop'
# Si stampa all'avvio: dice subito se sul PC c'e' la versione di GitHub.
$Versione = '2026-10-10a'
$EstensioniVideo = @('.mp4', '.m4v', '.mkv', '.avi', '.mov', '.webm', '.wmv', '.ts', '.m2ts', '.flv', '.mpg', '.mpeg')
# Gli scarti: un video sotto questa misura e' il promo di una release, non un
# film ne' un episodio; le cartelle degli extra dei film (gli "Extras" e gli
# speciali delle serie no: sono la stagione 0).
$MinimoMB = 5
$CartelleExtra = '^\s*(featurettes?|trailers?|interviews?|interviste|behind[ ._-]?the[ ._-]?scenes|dietro le quinte|deleted[ ._-]?scenes|scene tagliate|making[ ._-]?of|samples?)\s*$'
$SottotitoliTesto = @('subrip', 'ass', 'ssa', 'mov_text', 'webvtt', 'text')

# Le lingue dei sottotitoli che servono: il lettore di Ciak offre solo italiano
# e inglese, il resto finirebbe in un'unica traccia "altra lingua" (il cinese,
# per ordine alfabetico, prima di tutti) e ingombrerebbe Drive.
$LingueVolute = @('it', 'en')

function Lingua([string]$codice) {
  if (-not $codice) { return $null }
  switch ($codice.ToLower()) {
    { $_ -in 'it', 'ita', 'italian' } { return 'it' }
    { $_ -in 'en', 'eng', 'english' } { return 'en' }
    # Le altre piu' comuni a due lettere, come le prime: "ger" e "de" sono la
    # stessa lingua, e non deve entrare due volte nel menu Audio.
    { $_ -in 'fr', 'fre', 'fra' } { return 'fr' }
    { $_ -in 'de', 'ger', 'deu' } { return 'de' }
    { $_ -in 'es', 'spa' } { return 'es' }
    { $_ -in 'ja', 'jpn' } { return 'ja' }
    { $_ -in 'pt', 'por' } { return 'pt' }
    { $_ -in 'ru', 'rus' } { return 'ru' }
    { $_ -in 'zh', 'chi', 'zho' } { return 'zh' }
    { $_ -in 'ko', 'kor' } { return 'ko' }
    { $_ -in 'und', '' } { return $null }
    default { return $_.ToLower() }
  }
}

# L'uscita del programma va a schermo, non nel valore restituito: senza
# Out-Host una riga stampata da ffmpeg finirebbe dentro il codice d'uscita.
function Esegui([string]$programma, [string[]]$argomenti) {
  & $programma @argomenti | Out-Host
  return $LASTEXITCODE
}

foreach ($p in 'ffmpeg', 'ffprobe') {
  if (-not (Get-Command $p -ErrorAction SilentlyContinue)) {
    Write-Host "Non trovo $p. Installalo con:  winget install --id Gyan.FFmpeg -e" -ForegroundColor Red
    Write-Host 'poi chiudi e riapri la finestra.'
    Read-Host 'Premi Invio per chiudere'
    exit 1
  }
}
# Per le sole tracce audio la cartella dei download non serve.
if (-not $SoloTracceAudio -and -not $AggiungiLingua -and -not (Test-Path -LiteralPath $Origine)) {
  Write-Host "La cartella $Origine non esiste." -ForegroundColor Red
  Read-Host 'Premi Invio per chiudere'
  exit 1
}

if (Test-Path -LiteralPath $Origine) { $Origine = (Resolve-Path -LiteralPath $Origine).Path.TrimEnd('\', '/') }

# Ricodificare con la CPU va a circa 3 volte il tempo reale: una serie in
# HEVC a 10 bit sono ore. La scheda video (NVENC, Quick Sync, AMF) fa lo
# stesso lavoro 5-10 volte piu' in fretta. Si prova con un video di prova di
# un attimo: un encoder elencato da ffmpeg non e' detto che il PC lo abbia.
# Gli errori di ffmpeg qui sono attesi (un encoder che manca) e non devono
# fermare lo script: Windows PowerShell 5.1, con 'Stop', trasforma in errore
# anche il testo che un programma scrive su stderr, se lo si redirige.
function EncoderFunziona([string]$nome) {
  $ErrorActionPreference = 'Continue'
  try {
    & ffmpeg -hide_banner -loglevel quiet -f lavfi -i 'color=black:s=256x256:d=0.2' -pix_fmt yuv420p -c:v $nome -f null - 2>&1 | Out-Null
    return ($LASTEXITCODE -eq 0)
  } catch {
    return $false
  }
}
if ($Encoder -eq 'auto') {
  $Encoder = 'libx264'
  foreach ($candidato in 'h264_nvenc', 'h264_qsv', 'h264_amf') {
    if (EncoderFunziona $candidato) { $Encoder = $candidato; break }
  }
}

# Un video HDR (HDR10, HLG, Dolby Vision con base HDR10) ha i colori
# descritti per uno schermo da 1000 nit. Ricodificato in H.264 a 8 bit cosi'
# com'e', il tablet lo mostra slavato e grigiastro: i colori vanno
# ricalcolati per uno schermo normale (tone mapping). Lo fa zscale, che c'e'
# nella build di ffmpeg installata con winget (Gyan.FFmpeg) ma non in tutte.
$TrasferimentiHdr = @('smpte2084', 'arib-std-b67')
$FiltroHdr = 'zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p'
$ColoriSdr = @('-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709')
function FiltroDisponibile([string]$nome) {
  $ErrorActionPreference = 'Continue'
  try {
    $elenco = & ffmpeg -hide_banner -filters 2>&1 | Out-String
    return ($elenco -match "\s$nome\s")
  } catch {
    return $false
  }
}
$ToneMapping = (FiltroDisponibile 'zscale') -and (FiltroDisponibile 'tonemap')

# Gli argomenti per ricodificare il video con un encoder: qualita' simile per
# tutti, sempre H.264 a 8 bit (yuv420p), l'unico che ogni browser legge.
function ArgomentiVideo([string]$nome) {
  switch ($nome) {
    'h264_nvenc' { return @('-c:v', 'h264_nvenc', '-preset', 'p5', '-tune', 'hq', '-rc', 'vbr', '-cq', '21', '-b:v', '0', '-profile:v', 'high', '-pix_fmt', 'yuv420p') }
    'h264_qsv' { return @('-c:v', 'h264_qsv', '-preset', 'medium', '-global_quality', '21', '-pix_fmt', 'nv12') }
    'h264_amf' { return @('-c:v', 'h264_amf', '-quality', 'quality', '-rc', 'cqp', '-qp_i', '21', '-qp_p', '23', '-pix_fmt', 'yuv420p') }
    default { return @('-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p') }
  }
}

# Avvisi che ffmpeg ripete a ogni fotogramma su certi H.264 interlacciati (i
# DVDRip, spesso) senza che manchi niente: il video si vede benissimo. Contati
# come errori superavano da soli la soglia, e un Looney Tunes su due finiva
# fra i "danneggiati".
# Lo stesso vale per i tempi fuori ordine (un Toy Story in HEVC): li segnala
# il finto file d'uscita del controllo, non chi decodifica, quindi non dicono
# niente su quanto il video si legga; la ricodifica li sistema da se'.
$AvvisiInnocui = @('mmco: unref short failure', 'co located POCs unavailable', 'non monotonically increasing dts')

function ErroriVeri([string[]]$righe) {
  return @($righe | Where-Object {
      $riga = $_
      -not ($AvvisiInnocui | Where-Object { $riga -like "*$_*" })
    })
}

# Un video rotto (download interrotto, contenitore rifatto male) ffmpeg non lo
# rifiuta: scarta un pacchetto dopo l'altro riempiendo lo schermo di errori e
# alla fine esce con 0, lasciando su Drive un MP4 vuoto che poi si salterebbe
# per sempre. Decodificare i primi secondi lo scopre prima di cominciare.
# Qualche errore isolato all'inizio e' normale (i .ts partono a meta' di un
# fotogramma): se ne tollerano pochi. Come sopra, gli errori qui sono attesi.
# $null se il video si legge; se no le prime righe d'errore di ffmpeg, da
# mostrare: "danneggiato" senza dire perche' non si poteva verificare.
# Un download a meta' (torrent) e' gia' lungo quanto il file finito, ma i
# pezzi non ancora arrivati sono zeri: ffmpeg lo converte lo stesso, con
# salti e immagini rotte ("invalid as first byte of an EBML number", "Could
# not find ref with POC"), e la durata puo' tornare giusta. Un video vero non
# ha mai mezzo MB di zeri di fila: se li ha, mancano dei dati. Lo si cerca in
# C#, perche' leggere gigabyte un byte alla volta in PowerShell e' lentissimo.
Add-Type -TypeDefinition @'
using System.IO;
public static class CiakBuchi {
  // La posizione del primo tratto di zeri lungo almeno minBlocchi blocchi
  // interi, o -1.
  public static long PrimoBuco(string percorso, int blocco, int minBlocchi) {
    using (FileStream fs = new FileStream(percorso, FileMode.Open, FileAccess.Read, FileShare.ReadWrite, 1 << 20)) {
      byte[] buf = new byte[blocco];
      long pos = 0; int fila = 0; long inizio = -1;
      while (true) {
        int letti = 0;
        while (letti < blocco) {
          int n = fs.Read(buf, letti, blocco - letti);
          if (n == 0) break;
          letti += n;
        }
        if (letti == 0) break;
        bool zeri = letti == blocco;
        for (int i = 0; zeri && i < letti; i++) if (buf[i] != 0) zeri = false;
        if (zeri) {
          if (fila == 0) inizio = pos;
          fila++;
          if (fila >= minBlocchi) return inizio;
        } else {
          fila = 0;
        }
        pos += letti;
        if (letti < blocco) break;
      }
    }
    return -1;
  }
}
'@

# Blocchi da 64 KB, almeno 8 di fila: mezzo MB di zeri.
function PrimoBuco([string]$file) {
  return [CiakBuchi]::PrimoBuco($file, 65536, 8)
}

function VideoLeggibile([string]$file, [int]$indice) {
  $ErrorActionPreference = 'Continue'
  try {
    $righe = @(& ffmpeg -hide_banner -loglevel error -t 10 -i $file -map "0:$indice" -f null - 2>&1 | ForEach-Object { "$_" })
    $errori = ErroriVeri $righe
    if ($LASTEXITCODE -eq 0 -and $errori.Count -le 20) { return $null }
    $primi = @($errori | Select-Object -Unique -First 3)
    if ($primi.Count -eq 0) { return "ffmpeg e' uscito con codice $LASTEXITCODE" }
    return ($primi -join ' | ')
  } catch {
    return "$($_.Exception.Message)"
  }
}

# La durata in secondi di un file, 0 se non si sa (alcuni AVI e TS non la
# dichiarano). Si legge come per l'originale, in JSON e tutta d'un fiato,
# senza contare su $LASTEXITCODE: in Windows PowerShell un ffprobe chiuso a
# meta' dalla pipeline lo lascia sbagliato, e ogni video creato risultava
# lungo 0:00:00 e veniva scartato.
function Durata([string]$file) {
  $ErrorActionPreference = 'Continue'
  try {
    $info = (& ffprobe -v error -show_entries format=duration -of json -- $file | Out-String) | ConvertFrom-Json
    $d = 0.0
    if ($info -and $info.format -and [double]::TryParse("$($info.format.duration)", [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$d)) { return $d }
  } catch { }
  return 0
}

# Le tracce audio di un MP4 oltre la prima, ognuna in un .m4a accanto (in
# $cartella), e l'elenco di tutte in nome.audio.json. Una lettura sola del
# video per tutte le tracce: su Drive il file si scarica, e due letture
# costerebbero il doppio. Le tracce sono gia' AAC: si copiano, niente
# ricodifica. Torna i file creati, elenco compreso: si scrive anche per un
# video con una traccia sola, perche' dice che il video e' gia' stato guardato.
function TracceAudio([string]$mp4, [string]$cartella, [string]$nome) {
  $ErrorActionPreference = 'Continue'
  $info = (& ffprobe -v error -select_streams a -show_entries 'stream=index:stream_tags=language,title' -of json -- $mp4 | Out-String) | ConvertFrom-Json
  $audio = @($info.streams)
  $elenco = @()
  $creati = @()
  $uscite = @()
  for ($i = 0; $i -lt $audio.Count; $i++) {
    $file = $null
    if ($i -gt 0) {
      $file = "$nome.audio-$($i + 1).m4a"
      $percorso = Join-Path $cartella $file
      $uscite += @('-map', "0:a:$i", '-c', 'copy', '-vn', '-sn', '-movflags', '+faststart', $percorso)
      $creati += $percorso
    }
    $elenco += [ordered]@{ indice = $i + 1; lingua = Lingua "$($audio[$i].tags.language)"; titolo = "$($audio[$i].tags.title)"; file = $file }
  }
  if ($uscite.Count -gt 0) {
    $esito = Esegui 'ffmpeg' (@('-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', $mp4) + $uscite)
    if ($esito -ne 0) {
      $creati | ForEach-Object { Remove-Item -LiteralPath $_ -ErrorAction SilentlyContinue }
      throw 'estrazione delle tracce audio non riuscita'
    }
  }
  $json = ConvertTo-Json -InputObject ([ordered]@{ versione = 1; tracce = $elenco }) -Depth 4
  $elencoFile = Join-Path $cartella "$nome.audio.json"
  # Senza BOM: Windows PowerShell con Set-Content -Encoding UTF8 lo mette, e il
  # JSON non si leggerebbe piu'.
  [IO.File]::WriteAllText($elencoFile, $json, (New-Object Text.UTF8Encoding $false))
  return @($creati) + @($elencoFile)
}

function TracceInPiu([int]$n) { if ($n -eq 1) { return "1 lingua dell'audio in piu'" } return "$n lingue dell'audio in piu'" }

function Tempo([double]$secondi) { return [TimeSpan]::FromSeconds([math]::Round($secondi)).ToString('h\:mm\:ss') }

# Quanto e' utile una traccia, dal nome che le da' chi ha fatto il file: gli
# anime ne hanno spesso due per lingua, "Full Subtitles" (i dialoghi, piu' i
# cartelli) e "Signs & Songs" (solo cartelli e canzoni). Il segnale "forced"
# c'e' poco, il nome quasi sempre. Piu' basso e' meglio.
function PesoTraccia($traccia) {
  $nome = "$($traccia.tags.title)"
  if ($traccia.disposition -and $traccia.disposition.forced -eq 1) { return 3 }
  # "Full", "Dialogue", "Completi" vincono anche su un "no songs" nello stesso nome.
  $completa = $nome -match '(?i)\bfull\b|dialog|complet'
  if (-not $completa -and $nome -match '(?i)\bsigns?\b|\bsongs?\b|forced|forzat|cartell|karaoke') { return 3 }
  if ($traccia.disposition -and $traccia.disposition.hearing_impaired -eq 1) { return 1 }
  if ($nome -match '(?i)\bsdh\b|\bcc\b|non udenti|hearing') { return 1 }
  return 0
}

# Quante battute ha una traccia, se il file lo dice (mkvmerge scrive
# NUMBER_OF_FRAMES, a volte con la lingua attaccata: NUMBER_OF_FRAMES-eng).
# A parita' di nome, quella con piu' battute e' quella coi dialoghi.
function BattuteTraccia($traccia) {
  if (-not $traccia.tags) { return 0 }
  foreach ($p in $traccia.tags.PSObject.Properties) {
    $n = 0
    if ($p.Name -match '^NUMBER_OF_FRAMES' -and [int]::TryParse("$($p.Value)", [ref]$n)) { return $n }
  }
  return 0
}

# Per ogni lingua voluta la traccia migliore: non le "forced" o i soli
# cartelli (vedi PesoTraccia), potendo non quelle per non udenti, e fra le
# altre quella con piu' battute. Una traccia senza lingua si tiene solo se
# mancano tutte le altre: a volte e' l'unica.
function SottotitoliScelti($tracce) {
  $ordinate = @($tracce | Sort-Object { PesoTraccia $_ }, { -(BattuteTraccia $_) }, { [int]$_.index })
  $scelti = [ordered]@{}
  foreach ($s in $ordinate) {
    $l = Lingua $s.tags.language
    if ($l -and ($LingueVolute -contains $l) -and -not $scelti.Contains($l)) { $scelti[$l] = $s }
  }
  if ($scelti.Count -eq 0) {
    $senza = $ordinate | Where-Object { -not (Lingua $_.tags.language) } | Select-Object -First 1
    if ($senza) { $scelti[''] = $senza }
  }
  return $scelti
}

# L'audio traccia per traccia: l'AAC si copia (nessuna perdita, nessun
# tempo), il resto si ricodifica con un bitrate che cresce coi canali, perche'
# 192k bastano a uno stereo ma impoveriscono un 5.1.
function ArgomentiAudio($tracce) {
  $arg = @()
  for ($i = 0; $i -lt $tracce.Count; $i++) {
    $a = $tracce[$i]
    if ($a.codec_name -eq 'aac') {
      $arg += @("-c:a:$i", 'copy')
    } else {
      $canali = if ($a.channels) { [int]$a.channels } else { 2 }
      $kbit = [math]::Min(384, [math]::Max(192, 64 * $canali))
      $arg += @("-c:a:$i", 'aac', "-b:a:$i", "$($kbit)k")
    }
  }
  return $arg
}

# Un file che un altro programma tiene aperto (qBittorrent che lo sta ancora
# condividendo, un lettore video) non si cancella: si salta e lo si dice alla
# fine, invece di lasciare un errore a meta'. Provare ad aprirlo in esclusiva
# lo scopre prima di toccare qualunque cosa.
function InUso([string]$file) {
  try {
    $flusso = [IO.File]::Open($file, 'Open', 'Read', 'None')
    $flusso.Close()
    return $false
  } catch {
    return $true
  }
}

$cancellati = 0
$nonCancellati = @()
$cartelleToccate = @{}

# L'originale e i suoi .srt (Film.srt, Film.it.srt), per sempre: si arriva qui
# solo con la copia su Drive gia' controllata. Un .srt che su Drive non c'e'
# resta dov'e'.
function CancellaOriginale($f, [string]$nome, [string]$cartellaDest, [string]$relativo) {
  if (InUso $f.FullName) {
    $script:nonCancellati += "$relativo\$($f.Name): aperto da un altro programma (qBittorrent lo sta ancora condividendo?)"
    Write-Host "   originale tenuto: e' aperto da un altro programma" -ForegroundColor DarkYellow
    return
  }
  $srt = @(Get-ChildItem -LiteralPath $f.DirectoryName -File -Filter '*.srt' |
      Where-Object { $_.Name.StartsWith("$nome.", [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath (Join-Path $cartellaDest $_.Name)) })
  try {
    Remove-Item -LiteralPath $f.FullName -Force
    $srt | ForEach-Object { Remove-Item -LiteralPath $_.FullName -Force }
  } catch {
    $script:nonCancellati += "$relativo\$($f.Name): $($_.Exception.Message)"
    Write-Host "   originale tenuto: $($_.Exception.Message)" -ForegroundColor DarkYellow
    return
  }
  Write-Host '   originale cancellato' -ForegroundColor DarkGray
  $script:cancellati++
  $script:cartelleToccate[$f.DirectoryName] = $true
}

# Perche' un video e' uno scarto, o $null se va preparato.
function Scarto($f) {
  $base = [IO.Path]::GetFileNameWithoutExtension($f.Name)
  if ($base -match '(^|[._ -])sample($|[._ -])') { return 'anteprima' }
  if ($f.Directory.Name -match $CartelleExtra) { return 'extra' }
  if ($f.Length -lt $MinimoMB * 1MB) { return 'promo' }
  return $null
}

# ---- Lo stesso film in un'altra lingua ---------------------------------------
# Un film scaricato anche in italiano (o in inglese) non va su Drive una
# seconda volta: si prende solo il suo audio e lo si aggiunge come lingua al
# film che c'e' gia', nel menu Audio di Ciak. Le due versioni pero' non
# combaciano quasi mai al secondo: loghi diversi all'inizio, e le copie
# europee (PAL) vanno a 25 fotogrammi invece di 23,976, cioe' il 4% piu'
# veloci. Prima di aggiungere niente si misura lo scarto confrontando i rumori
# del film (musica ed effetti, uguali nelle due lingue) in tre punti: se i tre
# punti non dicono la stessa cosa le versioni sono montate diversamente, e la
# lingua non si aggiunge, perche' sarebbe fuori sincrono.

# Le parole che nei nomi delle release vengono dopo il titolo.
$EtichetteRelease = '^(2160p|1080p|720p|576p|480p|4k|uhd|bluray|bdrip|brrip|remux|web|webdl|webrip|hdtv|dvdrip|hdrip|x264|x265|h264|h265|hevc|avc|hdr|hdr10|10bit|10bits|ita|eng|italian|english|multi|dual|subs?|ac3|aac|dts|extended|proper|repack|complete)$'

# Titolo, anno ed episodio dal nome di un file: "Inception.2010.1080p.mkv" e
# "Inception (2010) ITA.mp4" danno la stessa chiave.
function ChiaveVideo([string]$nome) {
  $base = [IO.Path]::GetFileNameWithoutExtension($nome).ToLower() -replace '\[[^\]]*\]', ' ' -replace '[._()\-]', ' '
  $titolo = @(); $anno = $null; $episodio = $null
  foreach ($p in @($base -split '\s+' | Where-Object { $_ })) {
    if ($p -match '^s(\d{1,2})e(\d{1,3})$') { $episodio = 'S{0:D2}E{1:D2}' -f [int]$Matches[1], [int]$Matches[2]; break }
    if ($titolo.Count -gt 0 -and $p -match '^(19|20)\d\d$') { $anno = [int]$p; break }
    if ($p -match $EtichetteRelease) { break }
    $titolo += $p
  }
  if ($titolo.Count -eq 0) { return $null }
  return @{ titolo = ($titolo -join ' '); anno = $anno; episodio = $episodio }
}

# Stesso film: stesso titolo e stesso anno; stesso episodio: stessa serie e
# stessa sigla. Senza anno ne' episodio non si rischia: "Alien" non basta.
function StessoVideo($a, $b) {
  if (-not $a -or -not $b -or $a.titolo -ne $b.titolo) { return $false }
  if ($a.episodio -or $b.episodio) { return $a.episodio -eq $b.episodio }
  return $a.anno -and $a.anno -eq $b.anno
}

# I video gia' su Drive con la loro chiave, letti una volta sola.
$script:SuDrive = $null
function VideoSuDrive {
  if ($null -eq $script:SuDrive) {
    $script:SuDrive = [Collections.ArrayList]@()
    if (Test-Path -LiteralPath $Destinazione) {
      foreach ($v in @(Get-ChildItem -LiteralPath $Destinazione -Recurse -File -Filter '*.mp4' -ErrorAction SilentlyContinue)) {
        [void]$script:SuDrive.Add(@{ file = $v.FullName; chiave = (ChiaveVideo $v.Name) })
      }
    }
  }
  return $script:SuDrive
}

function Gemello([string]$nome) {
  $chiave = ChiaveVideo $nome
  if (-not $chiave) { return $null }
  return (VideoSuDrive | Where-Object { StessoVideo $chiave $_.chiave } | Select-Object -First 1)
}

function Num([double]$x) { return $x.ToString('0.######', [Globalization.CultureInfo]::InvariantCulture) }

# Il confronto vero e proprio, in C#: in PowerShell sarebbero minuti.
# Inviluppo: per ogni centesimo di secondo quanto cresce il volume (gli
# attacchi di musica ed effetti). Allinea: dove il pezzo corto combacia meglio
# dentro quello lungo, con la correlazione normalizzata; torna lo spostamento,
# quanto combacia e quanto combacia il secondo punto migliore lontano da li'.
$CodiceSincronia = @'
using System;
public static class CiakSincronia {
  public static double[] Inviluppo(byte[] pcm, int finestra) {
    int n = pcm.Length / 2 / finestra;
    double[] e = new double[n];
    for (int i = 0; i < n; i++) {
      double s = 0;
      int b = i * finestra * 2;
      for (int j = 0; j < finestra; j++) {
        short v = (short)(pcm[b + 2 * j] | (pcm[b + 2 * j + 1] << 8));
        s += (double)v * v;
      }
      e[i] = Math.Log(1.0 + s / finestra);
    }
    double[] d = new double[n];
    for (int i = 1; i < n; i++) { double x = e[i] - e[i - 1]; d[i] = x > 0 ? x : 0; }
    return d;
  }
  public static double[] Allinea(double[] a, double[] b) {
    int n = a.Length, passi = b.Length - n + 1;
    if (n < 100 || passi < 1) return new double[] { -1, 0, 0 };
    double ma = 0;
    for (int i = 0; i < n; i++) ma += a[i];
    ma /= n;
    double[] az = new double[n];
    double va = 0;
    for (int i = 0; i < n; i++) { az[i] = a[i] - ma; va += az[i] * az[i]; }
    if (va <= 0) return new double[] { -1, 0, 0 };
    double sa = Math.Sqrt(va);
    double[] c = new double[passi];
    double sb = 0, sbb = 0;
    for (int i = 0; i < n; i++) { sb += b[i]; sbb += b[i] * b[i]; }
    for (int k = 0; k < passi; k++) {
      if (k > 0) { double via = b[k - 1], nuovo = b[k + n - 1]; sb += nuovo - via; sbb += nuovo * nuovo - via * via; }
      double vb = sbb - sb * sb / n;
      if (vb <= 1e-9) { c[k] = 0; continue; }
      double dot = 0;
      for (int i = 0; i < n; i++) dot += az[i] * b[k + i];
      c[k] = dot / (sa * Math.Sqrt(vb));
    }
    int meglio = 0;
    for (int k = 1; k < passi; k++) if (c[k] > c[meglio]) meglio = k;
    double secondo = 0;
    for (int k = 0; k < passi; k++) if (Math.Abs(k - meglio) > 50 && c[k] > secondo) secondo = c[k];
    // Fra due centesimi: la parabola per i tre punti attorno al picco.
    double fine = meglio;
    if (meglio > 0 && meglio < passi - 1) {
      double curva = c[meglio - 1] - 2 * c[meglio] + c[meglio + 1];
      if (curva < 0) fine += 0.5 * (c[meglio - 1] - c[meglio + 1]) / curva;
    }
    return new double[] { fine, c[meglio], secondo };
  }
}
'@

# Un pezzo d'audio come inviluppo (vedi sopra). $tempo accelera o rallenta
# prima di misurare, come si fara' con l'audio vero.
function Inviluppo([string]$file, [int]$traccia, [double]$da, [double]$durata, [double]$tempo) {
  $ErrorActionPreference = 'Continue'
  $raw = Join-Path $Lavoro 'sincronia.raw'
  $filtro = 'aresample=8000'
  if ([math]::Abs($tempo - 1) -gt 1e-6) { $filtro = "atempo=$(Num $tempo),$filtro" }
  $esito = Esegui 'ffmpeg' @('-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-ss', (Num $da), '-t', (Num $durata), '-i', $file, '-map', "0:a:$traccia", '-ac', '1', '-af', $filtro, '-f', 's16le', $raw)
  if ($esito -ne 0 -or -not (Test-Path -LiteralPath $raw)) { throw "non riesco a leggere l'audio di $(Split-Path $file -Leaf)" }
  $byte = [IO.File]::ReadAllBytes($raw)
  Remove-Item -LiteralPath $raw -ErrorAction SilentlyContinue
  return , [CiakSincronia]::Inviluppo($byte, 80)
}

# Quanto spostare l'audio di $fonte perche' combaci col film: torna
# @{ tempo; scarto } (secondi, positivo: l'audio della fonte e' in ritardo e si
# taglia l'inizio) o $null se non si trova un accordo.
# Cinque punti lungo il film, e devono dire tutti la stessa cosa: una scena
# tagliata a meta' fa cambiare lo scarto da li' in poi, e con la maggioranza
# sola la prima meta' del film sarebbe rimasta fuori sincrono. Un punto senza
# un picco chiaro (una scena silenziosa) non vota; ne servono almeno tre.
function MisuraSincronia([string]$film, [string]$fonte, [int]$tracciaFonte, [double]$durataFilm, [double]$durataFonte) {
  if (-not ('CiakSincronia' -as [type])) { Add-Type -TypeDefinition $CodiceSincronia }
  $W = 60; $L = 45
  if ($durataFilm -lt 5 * $W + 2 * $L) { throw "il video e' troppo corto per misurare la sincronia" }
  # Dal film, che puo' stare solo su Drive, si legge poco: cinque minuti.
  $punti = @(0.1, 0.3, 0.5, 0.7, 0.9) | ForEach-Object { [math]::Min($durataFilm - $W - $L, [math]::Max($L, $_ * $durataFilm - $W / 2)) }
  $pezziFilm = @($punti | ForEach-Object { , (Inviluppo $film 0 $_ $W 1) })
  # Le velocita' possibili: uguali, una delle due copie in PAL (25 fotogrammi
  # contro 24 o 23,976), o 24 contro 23,976. Si provano in ordine di quanto
  # spiegano la differenza di durata.
  $rapporto = $durataFonte / $durataFilm
  $candidati = @(1.0, (23.976 / 25), (24 / 25), (25 / 23.976), (25 / 24), (23.976 / 24), (24 / 23.976)) | Sort-Object { [math]::Abs($_ - $rapporto) }
  foreach ($tempo in $candidati) {
    $scarti = @()
    for ($i = 0; $i -lt $punti.Count; $i++) {
      $inizio = $punti[$i] - $L
      $pezzo = Inviluppo $fonte $tracciaFonte ($inizio * $tempo) (($W + 2 * $L) * $tempo) $tempo
      $esito = [CiakSincronia]::Allinea($pezziFilm[$i], $pezzo)
      # Le voci sono diverse (e' un'altra lingua): la somiglianza resta bassa
      # anche quando e' giusta. Conta che spicchi sul resto.
      if ($esito[0] -lt 0 -or $esito[1] -lt 0.06 -or $esito[1] -lt 1.3 * $esito[2]) { continue }
      $scarti += $esito[0] / 100 - $L
    }
    if ($scarti.Count -lt 3) { continue }
    $minimo = ($scarti | Measure-Object -Minimum).Minimum
    $massimo = ($scarti | Measure-Object -Maximum).Maximum
    if ($massimo - $minimo -le 0.1) {
      return @{ tempo = $tempo; scarto = [math]::Round(($scarti | Measure-Object -Average).Average, 3) }
    }
    # Punti chiari ma in disaccordo: con questa velocita' il film e' montato
    # diversamente. Si prova la prossima; nessuna va bene -> $null.
  }
  return $null
}

# Le lingue gia' nel film, dal suo elenco o, senza, dal file.
function LingueDelFilm([string]$film) {
  $elenco = Join-Path (Split-Path $film -Parent) "$([IO.Path]::GetFileNameWithoutExtension($film)).audio.json"
  if (Test-Path -LiteralPath $elenco) {
    return @((Get-Content -LiteralPath $elenco -Raw -Encoding UTF8 | ConvertFrom-Json).tracce | ForEach-Object { Lingua "$($_.lingua)" })
  }
  $info = (& ffprobe -v error -select_streams a -show_entries 'stream_tags=language' -of json -- $film | Out-String) | ConvertFrom-Json
  return @($info.streams | ForEach-Object { Lingua "$($_.tags.language)" })
}

# La lingua dal nome della release ("Film.2010.ITA.mkv", "FRENCH"), quando
# il file non la dichiara. Con due lingue nel nome non si sa quale sia.
function LinguaDalNome([string]$nome) {
  $parole = @{ ita = 'it'; italian = 'it'; italiano = 'it'; eng = 'en'; english = 'en'; french = 'fr'; fre = 'fr'; vff = 'fr'; german = 'de'; ger = 'de'; deu = 'de'; spanish = 'es'; spa = 'es'; esp = 'es'; castellano = 'es'; japanese = 'ja'; jap = 'ja'; jpn = 'ja' }
  $trovate = @($nome.ToLower() -split '[^a-z]+' | Where-Object { $parole.ContainsKey($_) } | ForEach-Object { $parole[$_] } | Select-Object -Unique)
  if ($trovate.Count -eq 1) { return $trovate[0] }
  return $null
}

# Aggiunge al film su Drive le lingue di $fonte che gli mancano. Torna le
# lingue aggiunte (nessuna: c'erano gia' tutte); un errore se le versioni non
# combaciano.
function AggiungiLingua([string]$fonte, [string]$film, [string]$linguaForzata) {
  $ErrorActionPreference = 'Continue'
  $info = (& ffprobe -v error -select_streams a -show_entries 'stream=index,codec_name,channels:stream_tags=language,title' -of json -- $fonte | Out-String) | ConvertFrom-Json
  $tracce = @($info.streams)
  if ($tracce.Count -eq 0) { throw "$(Split-Path $fonte -Leaf) non ha audio" }
  $presenti = @(LingueDelFilm $film)
  $nuove = @()
  for ($i = 0; $i -lt $tracce.Count; $i++) {
    $lingua = Lingua "$($tracce[$i].tags.language)"
    if (-not $lingua -and $linguaForzata) { $lingua = Lingua $linguaForzata }
    if (-not $lingua -and $tracce.Count -eq 1) { $lingua = LinguaDalNome (Split-Path $fonte -Leaf) }
    if (-not $lingua) { continue }
    if ($presenti -contains $lingua -or ($nuove | Where-Object { $_.lingua -eq $lingua })) { continue }
    $nuove += @{ indice = $i; lingua = $lingua; traccia = $tracce[$i] }
  }
  if ($nuove.Count -eq 0) {
    if (-not ($tracce | Where-Object { $_.tags.language -and $_.tags.language -ne 'und' }) -and -not $linguaForzata -and -not (LinguaDalNome (Split-Path $fonte -Leaf))) {
      throw "non so di che lingua e' l'audio di $(Split-Path $fonte -Leaf): rilancia con aggiungi-lingua.bat, che lo chiede"
    }
    return
  }

  $durataFilm = Durata $film
  $durataFonte = Durata $fonte
  if ($durataFilm -le 0 -or $durataFonte -le 0) { throw 'non riesco a leggere la durata dei due video' }
  Write-Host "   misuro la sincronia con $(Split-Path $film -Leaf)..."
  $sincro = MisuraSincronia $film $fonte $nuove[0].indice $durataFilm $durataFonte
  if (-not $sincro) {
    throw "le due versioni non combaciano (montaggio diverso: director's cut, scene in piu'?): la lingua resterebbe fuori sincrono"
  }
  $velocita = if ([math]::Abs($sincro.tempo - 1) -lt 1e-6) { 'stessa velocita''' } else { 'velocita'' corretta (PAL)' }
  Write-Host "   sincronia trovata: $velocita, $(Num $sincro.scarto) s di scarto" -ForegroundColor DarkGray

  # L'elenco delle lingue del film: se manca lo si crea (e, se il film ha gia'
  # piu' tracce, si estraggono come per i video nuovi).
  $cartellaFilm = Split-Path $film -Parent
  $nomeFilm = [IO.Path]::GetFileNameWithoutExtension($film)
  $elencoFile = Join-Path $cartellaFilm "$nomeFilm.audio.json"
  if (-not (Test-Path -LiteralPath $elencoFile)) {
    foreach ($file in @(TracceAudio $film $Lavoro $nomeFilm)) {
      Move-Item -LiteralPath $file -Destination (Join-Path $cartellaFilm (Split-Path $file -Leaf)) -Force
    }
  }
  $elenco = @((Get-Content -LiteralPath $elencoFile -Raw -Encoding UTF8 | ConvertFrom-Json).tracce | ForEach-Object {
      [ordered]@{ indice = [int]$_.indice; lingua = $_.lingua; titolo = "$($_.titolo)"; file = $_.file }
    })
  $prossimo = [int]($elenco | ForEach-Object { $_.indice } | Measure-Object -Maximum).Maximum + 1

  # L'audio rimesso a tempo: accelerato o rallentato, poi tagliato all'inizio
  # (o preceduto da silenzio) dello scarto misurato, e lungo quanto il film.
  $filtri = @()
  if ([math]::Abs($sincro.tempo - 1) -gt 1e-6) { $filtri += "atempo=$(Num $sincro.tempo)" }
  if ($sincro.scarto -gt 0) { $filtri += "atrim=start=$(Num $sincro.scarto)", 'asetpts=PTS-STARTPTS' }
  elseif ($sincro.scarto -lt 0) { $filtri += "adelay=$([math]::Round(-$sincro.scarto * 1000)):all=1" }
  $uscite = @(); $creati = @()
  foreach ($n in $nuove) {
    $file = "$nomeFilm.audio-$prossimo.m4a"
    $percorso = Join-Path $Lavoro $file
    $canali = if ($n.traccia.channels) { [int]$n.traccia.channels } else { 2 }
    $kbit = [math]::Min(384, [math]::Max(192, 64 * $canali))
    $uscite += @('-map', "0:a:$($n.indice)")
    if ($filtri.Count -gt 0) { $uscite += @('-af', ($filtri -join ',')) }
    $uscite += @('-t', (Num $durataFilm), '-c:a', 'aac', '-b:a', "$($kbit)k", '-vn', '-sn', '-movflags', '+faststart', $percorso)
    $creati += $percorso
    $elenco += [ordered]@{ indice = $prossimo; lingua = $n.lingua; titolo = "$($n.traccia.tags.title)"; file = $file }
    $prossimo++
  }
  $esito = Esegui 'ffmpeg' (@('-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', $fonte) + $uscite)
  if ($esito -ne 0) {
    $creati | ForEach-Object { Remove-Item -LiteralPath $_ -ErrorAction SilentlyContinue }
    throw "conversione dell'audio non riuscita"
  }
  foreach ($c in $creati) { Move-Item -LiteralPath $c -Destination (Join-Path $cartellaFilm (Split-Path $c -Leaf)) -Force }
  # L'elenco per ultimo: finche' non c'e', Ciak non offre una lingua a meta'.
  $json = ConvertTo-Json -InputObject ([ordered]@{ versione = 1; tracce = $elenco }) -Depth 4
  [IO.File]::WriteAllText($elencoFile, $json, (New-Object Text.UTF8Encoding $false))
  return $nuove | ForEach-Object { $_.lingua }
}

# Il nome di una lingua per i messaggi.
function NomeLingua([string]$codice) {
  $nomi = @{ it = 'italiano'; en = 'inglese'; ja = 'giapponese'; fr = 'francese'; de = 'tedesco'; es = 'spagnolo'; pt = 'portoghese'; ru = 'russo'; zh = 'cinese'; ko = 'coreano' }
  if ($nomi.ContainsKey($codice)) { return $nomi[$codice] }
  return $codice
}

$Lavoro = Join-Path ([IO.Path]::GetTempPath()) 'ciak-conversione'
New-Item -ItemType Directory -Force -Path $Lavoro | Out-Null

Write-Host "prepara-ciak, versione $Versione"
Write-Host "Da:  $Origine"
Write-Host "A:   $Destinazione"
if ($TieniOriginali) { Write-Host 'Originali: restano dove sono' } else { Write-Host "Originali: cancellati quando la copia su Drive e' intera" }
if ($Encoder -eq 'libx264') { Write-Host 'Ricodifica: con la CPU (nessuna scheda video utilizzabile trovata)' } else { Write-Host "Ricodifica: con la scheda video ($Encoder)" }
Write-Host ''

if ($SoloTracceAudio) {
  # I video gia' su Drive senza elenco delle tracce: uno alla volta, e solo
  # quelli con piu' di una traccia si leggono per intero (Drive per desktop li
  # scarica). Si puo' interrompere e rilanciare: riparte da dove era.
  if (-not (Test-Path -LiteralPath $Destinazione)) {
    Write-Host "La cartella $Destinazione non esiste: Google Drive per desktop e' aperto?" -ForegroundColor Red
    if (-not $env:CIAK_SENZA_PAUSA) { Read-Host 'Premi Invio per chiudere' }
    exit 1
  }
  Write-Host 'Preparo le tracce audio dei video gia'' su Drive...'
  $suDrive = @(Get-ChildItem -LiteralPath $Destinazione -Recurse -File -Filter '*.mp4' |
      Where-Object { -not (Test-Path -LiteralPath (Join-Path $_.DirectoryName "$([IO.Path]::GetFileNameWithoutExtension($_.Name)).audio.json")) } |
      Sort-Object FullName)
  $conTracce = 0; $erroriAudio = @(); $k = 0
  foreach ($f in $suDrive) {
    $k++
    $nome = [IO.Path]::GetFileNameWithoutExtension($f.Name)
    $relativo = $f.DirectoryName.Substring($Destinazione.Length).TrimStart('\', '/')
    Write-Host "[$k/$($suDrive.Count)] $relativo\$($f.Name)"
    try {
      $fatti = @(TracceAudio $f.FullName $Lavoro $nome)
      foreach ($file in $fatti) {
        $finale = Join-Path $f.DirectoryName (Split-Path $file -Leaf)
        Move-Item -LiteralPath $file -Destination $finale -Force
      }
      if ($fatti.Count -gt 1) {
        $conTracce++
        Write-Host "   $(TracceInPiu ($fatti.Count - 1))" -ForegroundColor Green
      }
    } catch {
      $erroriAudio += "$relativo\$($f.Name): $($_.Exception.Message)"
      Write-Host "   ERRORE: $($_.Exception.Message)" -ForegroundColor Red
      Get-ChildItem -LiteralPath $Lavoro -File -Filter "$nome.*" -ErrorAction SilentlyContinue | Remove-Item -ErrorAction SilentlyContinue
    }
  }
  if ($erroriAudio.Count -gt 0) {
    Write-Host ''
    Write-Host "Video con errori ($($erroriAudio.Count)):" -ForegroundColor Red
    $erroriAudio | ForEach-Object { Write-Host "  $_" }
  }
  Write-Host ''
  Write-Host "Finito: $($suDrive.Count) video controllati, $conTracce con lingue in piu' pronte per Ciak."
  if (-not $env:CIAK_SENZA_PAUSA) { Read-Host 'Premi Invio per chiudere' }
  exit 0
}

if ($AggiungiLingua) {
  # Niente "Premi Invio" qui: aggiungi-lingua.bat si ferma da solo alla fine,
  # una volta per tutti i video trascinati.
  if (-not (Test-Path -LiteralPath $AggiungiLingua -PathType Leaf)) {
    Write-Host "Non trovo il video $AggiungiLingua" -ForegroundColor Red
    exit 1
  }
  $fonte = (Resolve-Path -LiteralPath $AggiungiLingua).Path
  $nomeFonte = Split-Path $fonte -Leaf
  Write-Host "Aggiungo la lingua di $nomeFonte"
  $scelto = $Film
  if (-not $scelto) {
    # I film su Drive che le somigliano: parole del titolo in comune, e lo
    # stesso anno conta da solo ("Il Padrino 1972" e "The Godfather 1972").
    $chiave = ChiaveVideo $nomeFonte
    $parole = if ($chiave) { @($chiave.titolo -split ' ') } else { @() }
    $candidati = @(VideoSuDrive | ForEach-Object {
        $k = $_.chiave
        $punti = 0
        if ($k -and $chiave) {
          $suoi = @($k.titolo -split ' ')
          $punti = @($parole | Where-Object { $suoi -contains $_ }).Count / [math]::Max($parole.Count, $suoi.Count)
          if ($chiave.anno -and $k.anno -eq $chiave.anno) { $punti += 0.5 }
          if ($chiave.episodio -and $k.episodio -ne $chiave.episodio) { $punti = 0 }
        }
        @{ file = $_.file; punti = $punti }
      } | Where-Object { $_.punti -gt 0 } | Sort-Object { - $_.punti } | Select-Object -First 9)
    while (-not $scelto) {
      if ($candidati.Count -eq 0) {
        Write-Host 'Non trovo film che gli somiglino.' -ForegroundColor DarkYellow
      } else {
        Write-Host 'A quale film aggiungo la lingua?'
        for ($i = 0; $i -lt $candidati.Count; $i++) {
          Write-Host "  $($i + 1)) $($candidati[$i].file.Substring($Destinazione.Length).TrimStart('\', '/'))"
        }
      }
      $risposta = Read-Host 'Numero del film, o una parola del titolo per cercarlo (Invio per lasciar stare)'
      if (-not $risposta) { Write-Host 'Lasciato stare.'; exit 0 }
      $numero = 0
      if ([int]::TryParse($risposta, [ref]$numero) -and $numero -ge 1 -and $numero -le $candidati.Count) {
        $scelto = $candidati[$numero - 1].file
      } else {
        $candidati = @(VideoSuDrive | Where-Object { (Split-Path $_.file -Leaf) -like "*$risposta*" } | Select-Object -First 9 | ForEach-Object { @{ file = $_.file } })
      }
    }
  }
  if (-not (Test-Path -LiteralPath $scelto -PathType Leaf)) {
    Write-Host "Non trovo il film $scelto" -ForegroundColor Red
    exit 1
  }
  # Una traccia senza lingua dichiarata: la si chiede, se il nome non la dice.
  $lingua = $LinguaNuova
  $senza = @(((& ffprobe -v error -select_streams a -show_entries 'stream_tags=language' -of json -- $fonte | Out-String) | ConvertFrom-Json).streams |
      Where-Object { -not (Lingua "$($_.tags.language)") })
  if (-not $lingua -and $senza.Count -gt 0 -and -not (LinguaDalNome $nomeFonte) -and -not $env:CIAK_SENZA_PAUSA) {
    $lingua = Read-Host "Il file non dice di che lingua e' l'audio. Che lingua e'? (it, en, ja, fr, de, es...)"
  }
  try {
    $aggiunte = @(AggiungiLingua $fonte $scelto $lingua)
  } catch {
    Write-Host "ERRORE: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
  }
  if ($aggiunte.Count -eq 0) {
    Write-Host "Il film ha gia' tutte le lingue di $nomeFonte." -ForegroundColor DarkYellow
  } else {
    Write-Host "Fatto: $(($aggiunte | ForEach-Object { NomeLingua $_ }) -join ', ') nel menu Audio di Ciak." -ForegroundColor Green
  }
  if (-not $TieniOriginali -and -not $env:CIAK_SENZA_PAUSA) {
    if ((Read-Host "Cancello $nomeFonte, che ora non serve piu'? (s/N)") -match '^s') {
      try { Remove-Item -LiteralPath $fonte -Force; Write-Host 'Cancellato.' } catch { Write-Host "Non riesco: $($_.Exception.Message)" -ForegroundColor DarkYellow }
    }
  }
  exit 0
}

Write-Host 'Cerco i video...'
$tutti = Get-ChildItem -LiteralPath $Origine -Recurse -File |
  Where-Object { $EstensioniVideo -contains $_.Extension.ToLower() } |
  Sort-Object FullName
$video = @($tutti | Where-Object { -not (Scarto $_) })
# Due versioni dello stesso film nello stesso giro: la piu' grande (di solito
# la qualita' migliore) va su Drive come video, l'altra ne diventa una lingua.
$video = @($video | Sort-Object @{ Expression = {
      $k = ChiaveVideo $_.Name
      if ($k -and ($k.anno -or $k.episodio)) { "$($k.titolo)|$($k.anno)|$($k.episodio)" } else { $_.FullName.ToLower() }
    }
  }, @{ Expression = { $_.Length }; Descending = $true })
$scarti = @($tutti | Where-Object { Scarto $_ })
if ($scarti.Count -gt 0) {
  Write-Host "Salto $($scarti.Count) scarti delle release (anteprime, promo, extra): su Drive va solo il film." -ForegroundColor DarkGray
}

$fatti = 0; $saltati = 0; $errori = 0; $ricodificati = 0; $inDownload = 0; $lingueAggiunte = 0
$elencoErrori = @()
$calma = (Get-Date).AddMinutes(-$MinutiDiCalma)
$n = 0
foreach ($f in $video) {
  $n++
  $relativo = $f.DirectoryName.Substring($Origine.Length).TrimStart('\', '/')
  $cartellaDest = if ($relativo) { Join-Path $Destinazione $relativo } else { $Destinazione }
  $nome = [IO.Path]::GetFileNameWithoutExtension($f.Name)
  $dest = Join-Path $cartellaDest "$nome.mp4"
  $recente = $f.LastWriteTime -gt $calma
  if (Test-Path -LiteralPath $dest) {
    $saltati++
    # Gia' su Drive da un giro precedente: l'originale si cancella solo se la
    # copia dura quanto lui. Una copia corta o illeggibile (di prima dei
    # controlli sulla durata) e' proprio il motivo per tenerlo.
    # Si scrive a schermo: la copia su Drive va riletta (e Drive per desktop,
    # se e' solo online, la scarica almeno in parte), e centinaia di controlli
    # muti sembravano uno script bloccato.
    if (-not $TieniOriginali -and -not $recente) {
      Write-Host "[$n/$($video.Count)] $relativo\$($f.Name): gia' su Drive, controllo la copia..."
      $durataDrive = Durata $dest
      $durataOrig = Durata $f.FullName
      if ($durataDrive -gt 0 -and ($durataOrig -le 0 -or $durataDrive -ge $durataOrig * 0.95)) {
        CancellaOriginale $f $nome $cartellaDest $relativo
      } else {
        $nonCancellati += "$relativo\$($f.Name): la copia su Drive dura $(Tempo $durataDrive), l'originale $(Tempo $durataOrig). Lo tengo: cancella la copia su Drive e rilancia per rifarla"
        Write-Host "   originale tenuto: la copia su Drive dura $(Tempo $durataDrive), l'originale $(Tempo $durataOrig)" -ForegroundColor DarkYellow
      }
    }
    continue
  }
  if ($recente) {
    Write-Host "[$n/$($video.Count)] $relativo\$($f.Name): scritto da pochi minuti, forse e' ancora in download. Lo salto per ora." -ForegroundColor DarkYellow
    $inDownload++
    continue
  }

  Write-Host "[$n/$($video.Count)] $relativo\$($f.Name)"
  try {
    $buco = PrimoBuco $f.FullName
    if ($buco -ge 0) {
      throw "mancano dei dati a $([math]::Round($buco / 1MB)) MB dall'inizio (solo zeri): il download non e' finito o il file e' rovinato. In qBittorrent: tasto destro sul torrent > Forza ricontrollo, aspetta che arrivi al 100% e rilancia. L'originale resta dov'e'"
    }
    # Lo stesso film gia' su Drive, in un'altra lingua: se ne prende l'audio.
    $gemello = Gemello $f.Name
    if ($gemello) {
      Write-Host "   e' lo stesso video di $($gemello.file.Substring($Destinazione.Length).TrimStart('\', '/')): ne aggiungo solo la lingua"
      $aggiunte = @(AggiungiLingua $f.FullName $gemello.file '')
      if ($aggiunte.Count -gt 0) {
        $lingueAggiunte++
        Write-Host "   aggiunto l'audio in $(($aggiunte | ForEach-Object { NomeLingua $_ }) -join ', ')" -ForegroundColor Green
      } else {
        $saltati++
        Write-Host "   le sue lingue il film le ha gia'" -ForegroundColor DarkGray
      }
      if (-not $TieniOriginali) { CancellaOriginale $f $nome (Split-Path $gemello.file -Parent) $relativo }
      continue
    }
    $json = & ffprobe -v error -show_entries 'format=duration:stream=index,codec_type,codec_name,pix_fmt,channels,color_transfer:stream_disposition=attached_pic,forced,hearing_impaired:stream_tags:stream_side_data=dv_profile' -of json -- $f.FullName | Out-String
    if ($LASTEXITCODE -ne 0) { throw 'ffprobe non riesce a leggere il file' }
    $info = $json | ConvertFrom-Json
    $flussi = @($info.streams)
    $durataOrigine = 0
    if ($info.format -and $info.format.duration) { try { $durataOrigine = [double]$info.format.duration } catch { } }

    # Il video vero: non la copertina che alcuni MKV portano come "video".
    $v = $flussi | Where-Object { $_.codec_type -eq 'video' -and -not ($_.disposition -and $_.disposition.attached_pic -eq 1) } | Select-Object -First 1
    if (-not $v) { throw 'nessuna traccia video' }
    # Un controllo che scarta anche file sani (episodi interi di Better Call
    # Saul e dei Looney Tunes che VLC apre benissimo) non puo' avere l'ultima
    # parola: decide quello sulla durata del video creato, piu' sotto, che un
    # file davvero rotto non passa comunque. Solo le clip di meno di un minuto,
    # che quel controllo non lo fanno, si fermano qui.
    $illeggibile = VideoLeggibile $f.FullName $v.index
    if ($illeggibile -and $durataOrigine -le 60) {
      throw "il video e' danneggiato e ffmpeg non riesce a leggerlo ($illeggibile). Prova ad aprirlo con VLC: se non si vede va riscaricato, se si vede rifallo con  ffmpeg -i ""$($f.Name)"" -map 0 -c copy riparato.mkv"
    }
    if ($illeggibile) {
      Write-Host "   ffmpeg segnala errori nei primi secondi ($illeggibile): provo comunque, il controllo sulla durata dira' se e' venuto bene" -ForegroundColor DarkYellow
    }
    $audio = @($flussi | Where-Object { $_.codec_type -eq 'audio' })
    $sub = @($flussi | Where-Object { $_.codec_type -eq 'subtitle' -and $SottotitoliTesto -contains $_.codec_name })

    $hdr = $TrasferimentiHdr -contains $v.color_transfer
    # Il Dolby Vision profilo 5 (molti WEB-DL "DV") non ha sotto un HDR10
    # normale: senza i suoi metadati i colori escono verdi e viola, e zscale
    # non li sa usare. Meglio dirlo che caricare un film dai colori sbagliati.
    $dv = @($v.side_data_list | Where-Object { $_ -and $_.dv_profile -ne $null } | Select-Object -First 1)
    if ($dv.Count -gt 0 -and "$($dv[0].dv_profile)" -eq '5') {
      throw "video Dolby Vision profilo 5: convertito avrebbe i colori verdi e viola. Scarica una versione HDR10 o SDR (senza DV nel nome)"
    }
    if ($hdr -and -not $ToneMapping) {
      throw "video HDR, ma questo ffmpeg non sa convertirne i colori (manca zscale) e uscirebbe slavato. Reinstalla ffmpeg con  winget install --id Gyan.FFmpeg -e  e rilancia"
    }
    $colori = if ($hdr) { @('-vf', $FiltroHdr) + $ColoriSdr } else { @() }

    # yuvj420p e' lo stesso 8 bit 4:2:0 con la gamma piena: il browser lo legge.
    # Un H.264 HDR (raro) va ricodificato comunque, per i colori.
    $copiaVideo = ($v.codec_name -eq 'h264') -and (@('yuv420p', 'yuvj420p') -contains $v.pix_fmt) -and -not $hdr

    $tmp = Join-Path $Lavoro "$nome.mp4"
    $audioArg = @(ArgomentiAudio $audio)
    $mappe = @('-map', "0:$($v.index)", '-map', '0:a?')
    $uscita = @('-sn', '-dn', '-movflags', '+faststart', '-f', 'mp4', $tmp)
    $base = @('-hide_banner', '-loglevel', 'error', '-stats', '-y')
    if ($copiaVideo) {
      $esito = Esegui 'ffmpeg' ($base + @('-i', $f.FullName) + $mappe + @('-c:v', 'copy') + $audioArg + $uscita)
    } else {
      $notaHdr = if ($hdr) { ' HDR, colori convertiti per schermi normali' } else { '' }
      Write-Host "   video $($v.codec_name) $($v.pix_fmt)$($notaHdr): lo ricodifico in H.264 ($Encoder)..." -ForegroundColor Yellow
      $ricodificati++
      # Con la scheda video anche la lettura (HEVC compreso) passa dalla GPU;
      # se non ci riesce ffmpeg torna da solo alla CPU.
      $lettura = if ($Encoder -eq 'libx264') { @() } else { @('-hwaccel', 'auto') }
      $esito = Esegui 'ffmpeg' ($base + $lettura + @('-i', $f.FullName) + $mappe + $colori + (ArgomentiVideo $Encoder) + $audioArg + $uscita)
      if ($esito -ne 0 -and $Encoder -ne 'libx264') {
        # Qualche file la scheda video non lo prende (formati rari, risoluzioni
        # strane): lo si rifa' con la CPU invece di lasciarlo indietro.
        Write-Host "   la scheda video non ce l'ha fatta: riprovo con la CPU..." -ForegroundColor Yellow
        $esito = Esegui 'ffmpeg' ($base + @('-i', $f.FullName) + $mappe + $colori + (ArgomentiVideo 'libx264') + $audioArg + $uscita)
      }
    }
    if ($esito -ne 0) { throw 'conversione non riuscita' }

    # ffmpeg davanti a un file troncato (download a meta', pezzi mancanti) si
    # ferma dove finiscono i dati ed esce con 0: un film di un'ora diventava
    # un MP4 di sei minuti, che poi si sarebbe saltato per sempre.
    $durataFatta = Durata $tmp
    if ($durataOrigine -gt 60 -and $durataFatta -le 0) {
      throw "ffprobe non riesce a leggere la durata del video creato ($tmp): il controllo non si puo' fare"
    }
    if ($durataOrigine -gt 60 -and $durataFatta -lt $durataOrigine * 0.95) {
      throw "il video creato dura $(Tempo $durataFatta) ma l'originale $(Tempo $durataOrigine): l'originale e' incompleto (ancora in download?) o danneggiato"
    }

    # I sottotitoli interni, tutti in una sola lettura del file: estrarli uno
    # alla volta voleva dire rileggere l'intero video per ogni traccia.
    $srt = @()
    $scelti = SottotitoliScelti $sub
    if ($scelti.Count -gt 0) {
      $uscite = @()
      $percorsi = @{}
      foreach ($l in $scelti.Keys) {
        $percorsi[$l] = if ($l) { Join-Path $Lavoro "$nome.$l.srt" } else { Join-Path $Lavoro "$nome.srt" }
        $uscite += @('-map', "0:$($scelti[$l].index)", '-c:s', 'srt', $percorsi[$l])
      }
      $esitoSub = Esegui 'ffmpeg' (@('-hide_banner', '-loglevel', 'error', '-y', '-i', $f.FullName) + $uscite)
      foreach ($l in $scelti.Keys) {
        # Se la lettura unica fallisce, una traccia rotta non deve portarsi via
        # le altre: quelle mancanti si riprovano da sole.
        if ($esitoSub -ne 0 -or -not (Test-Path -LiteralPath $percorsi[$l])) {
          $null = Esegui 'ffmpeg' @('-hide_banner', '-loglevel', 'error', '-y', '-i', $f.FullName, '-map', "0:$($scelti[$l].index)", '-c:s', 'srt', $percorsi[$l])
        }
        if (Test-Path -LiteralPath $percorsi[$l]) { $srt += $percorsi[$l] }
      }
    }

    # Le lingue dell'audio oltre la prima, accanto al video (vedi TracceAudio).
    $audioExtra = @(TracceAudio $tmp $Lavoro $nome)
    if ($audioExtra.Count -gt 1) { Write-Host "   $(TracceInPiu ($audioExtra.Count - 1)), a parte per il menu Audio di Ciak" -ForegroundColor DarkGray }

    New-Item -ItemType Directory -Force -Path $cartellaDest | Out-Null
    Move-Item -LiteralPath $tmp -Destination $dest -Force
    # Un'altra versione dello stesso film, piu' avanti in questo giro, lo trova.
    if ($null -ne $script:SuDrive) { [void]$script:SuDrive.Add(@{ file = $dest; chiave = (ChiaveVideo "$nome.mp4") }) }
    foreach ($file in @($srt) + $audioExtra) {
      $finale = Join-Path $cartellaDest (Split-Path $file -Leaf)
      if (Test-Path -LiteralPath $finale) { Remove-Item -LiteralPath $file } else { Move-Item -LiteralPath $file -Destination $finale }
    }
    # I .srt gia' accanto all'originale (scaricati a parte): si copiano tali e quali.
    Get-ChildItem -LiteralPath $f.DirectoryName -File -Filter '*.srt' |
      Where-Object { $_.Name.StartsWith($nome, [StringComparison]::OrdinalIgnoreCase) } |
      ForEach-Object {
        $finale = Join-Path $cartellaDest $_.Name
        if (-not (Test-Path -LiteralPath $finale)) { Copy-Item -LiteralPath $_.FullName -Destination $finale }
      }

    $fatti++
    Write-Host "   fatto" -ForegroundColor Green
    if (-not $TieniOriginali) { CancellaOriginale $f $nome $cartellaDest $relativo }
  } catch {
    $errori++
    $elencoErrori += "$relativo\$($f.Name)`r`n   $($_.Exception.Message)"
    Write-Host "   ERRORE: $($_.Exception.Message). Il file su Drive non e' stato creato." -ForegroundColor Red
    Get-ChildItem -LiteralPath $Lavoro -File -Filter "$nome.*" -ErrorAction SilentlyContinue | Remove-Item -ErrorAction SilentlyContinue
  }
}

Write-Host ''
# Con centinaia di video gli errori scorrono via: alla fine si ripetono tutti
# insieme e restano in un file accanto allo script, da guardare con calma.
$fileErrori = Join-Path $PSScriptRoot 'prepara-ciak-errori.txt'
if ($elencoErrori.Count -gt 0) {
  Write-Host "Video con errori ($($elencoErrori.Count)):" -ForegroundColor Red
  $elencoErrori | ForEach-Object { Write-Host "  $_" }
  Write-Host ''
  try {
    Set-Content -LiteralPath $fileErrori -Value (@("Video non preparati per Ciak - $(Get-Date -Format 'dd/MM/yyyy HH:mm')", '') + $elencoErrori)
    Write-Host "L'elenco e' anche in $fileErrori"
  } catch {
    Write-Host "Non riesco a salvare l'elenco in $fileErrori" -ForegroundColor DarkYellow
  }
} elseif (Test-Path -LiteralPath $fileErrori) {
  Remove-Item -LiteralPath $fileErrori -ErrorAction SilentlyContinue
}
# Gli scarti accanto a un film fatto (o nella sua cartella degli extra) se ne
# vanno con lui: altrimenti la cartella non si svuoterebbe mai.
$scartiCancellati = 0
if (-not $TieniOriginali) {
  foreach ($f in $scarti) {
    $cartella = $f.DirectoryName
    $padre = Split-Path $cartella -Parent
    if (-not ($cartelleToccate.ContainsKey($cartella) -or $cartelleToccate.ContainsKey($padre))) { continue }
    if ($f.LastWriteTime -gt $calma -or (InUso $f.FullName)) { continue }
    try {
      Remove-Item -LiteralPath $f.FullName -Force
      $scartiCancellati++
      $cartelleToccate[$cartella] = $true
    } catch {
      $nonCancellati += "$($f.FullName): $($_.Exception.Message)"
    }
  }
}

# Le cartelle rimaste vuote (Season 01, poi la serie) se ne vanno anche loro;
# quelle di primo livello (FILM, SERIE TV...) restano: e' li' che si mettono i
# video nuovi.
foreach ($cartella in $cartelleToccate.Keys) {
  $c = $cartella
  while ($c.Length -gt $Origine.Length -and $c.Substring($Origine.Length).Trim('\', '/').IndexOfAny([char[]]'\/') -ge 0) {
    if (@(Get-ChildItem -LiteralPath $c -Force -ErrorAction SilentlyContinue).Count -gt 0) { break }
    Remove-Item -LiteralPath $c -ErrorAction SilentlyContinue
    $c = Split-Path $c -Parent
  }
}

if ($nonCancellati.Count -gt 0) {
  Write-Host "Originali non cancellati ($($nonCancellati.Count)):" -ForegroundColor DarkYellow
  $nonCancellati | ForEach-Object { Write-Host "  $_" }
  Write-Host ''
}

$inDownloadTesto = if ($inDownload) { ", $inDownload forse ancora in download (rilancia piu' tardi)" } else { '' }
$cancellatiTesto = if ($cancellati) { ", $cancellati originali cancellati" } else { '' }
if ($scartiCancellati) { $cancellatiTesto += ", $scartiCancellati scarti cancellati" }
$lingueTesto = if ($lingueAggiunte) { ", $lingueAggiunte aggiunti come lingua a un film gia' su Drive" } else { '' }
Write-Host "Finito: $fatti pronti per Ciak ($ricodificati ricodificati)$lingueTesto, $saltati gia' presenti, $errori errori$inDownloadTesto$cancellatiTesto."
if (-not $env:CIAK_SENZA_PAUSA) { Read-Host 'Premi Invio per chiudere' }
