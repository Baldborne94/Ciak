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
  [switch]$TieniOriginali
)

$ErrorActionPreference = 'Stop'
# Si stampa all'avvio: dice subito se sul PC c'e' la versione di GitHub.
$Versione = '2026-10-08a'
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
if (-not (Test-Path -LiteralPath $Origine)) {
  Write-Host "La cartella $Origine non esiste." -ForegroundColor Red
  Read-Host 'Premi Invio per chiudere'
  exit 1
}

$Origine = (Resolve-Path -LiteralPath $Origine).Path.TrimEnd('\', '/')

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

$Lavoro = Join-Path ([IO.Path]::GetTempPath()) 'ciak-conversione'
New-Item -ItemType Directory -Force -Path $Lavoro | Out-Null

Write-Host "prepara-ciak, versione $Versione"
Write-Host "Da:  $Origine"
Write-Host "A:   $Destinazione"
if ($TieniOriginali) { Write-Host 'Originali: restano dove sono' } else { Write-Host "Originali: cancellati quando la copia su Drive e' intera" }
if ($Encoder -eq 'libx264') { Write-Host 'Ricodifica: con la CPU (nessuna scheda video utilizzabile trovata)' } else { Write-Host "Ricodifica: con la scheda video ($Encoder)" }
Write-Host ''

Write-Host 'Cerco i video...'
$tutti = Get-ChildItem -LiteralPath $Origine -Recurse -File |
  Where-Object { $EstensioniVideo -contains $_.Extension.ToLower() } |
  Sort-Object FullName
$video = @($tutti | Where-Object { -not (Scarto $_) })
$scarti = @($tutti | Where-Object { Scarto $_ })
if ($scarti.Count -gt 0) {
  Write-Host "Salto $($scarti.Count) scarti delle release (anteprime, promo, extra): su Drive va solo il film." -ForegroundColor DarkGray
}

$fatti = 0; $saltati = 0; $errori = 0; $ricodificati = 0; $inDownload = 0
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

    New-Item -ItemType Directory -Force -Path $cartellaDest | Out-Null
    Move-Item -LiteralPath $tmp -Destination $dest -Force
    foreach ($file in $srt) {
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
Write-Host "Finito: $fatti pronti per Ciak ($ricodificati ricodificati), $saltati gia' presenti, $errori errori$inDownloadTesto$cancellatiTesto."
if (-not $env:CIAK_SENZA_PAUSA) { Read-Host 'Premi Invio per chiudere' }
