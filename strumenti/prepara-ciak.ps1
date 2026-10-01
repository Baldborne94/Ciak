# Prepara i video per Ciak.
#
# Prende i video da una cartella del PC (di solito E:\Intrattenimento) e li
# mette nella cartella Ciak di Google Drive gia' pronti per il lettore di Ciak:
#   - MP4 con l'indice all'inizio (+faststart), cosi' parte subito e si salta;
#   - video H.264 a 8 bit, l'unico che ogni browser e ogni tablet legge: se lo
#     e' gia' si copia (pochi secondi), altrimenti si ricodifica (lento);
#   - tutte le tracce audio in AAC: Dolby (AC3/E-AC3) e DTS il browser non li
#     sente, e il video partirebbe muto;
#   - i sottotitoli dentro il file (SRT, ASS) estratti in .srt accanto al video,
#     con la lingua nel nome (Film.it.srt, Film.en.srt), dove Ciak li trova;
#   - i .srt gia' accanto al video originale, copiati.
# La conversione si fa sul disco del PC e solo il risultato va su Drive: un
# file letto e riscritto direttamente su Drive va scaricato e ricaricato
# intero, ed e' quello che rendeva tutto lentissimo.
#
# Le sottocartelle si ricopiano uguali (FILM, SERIE TV\South Park\Season 01...):
# sono le schede e le serie di Ciak. I video gia' presenti su Drive si saltano,
# quindi si puo' rilanciare quando si vuole: fa solo quelli nuovi. Gli
# originali restano dove sono.
#
# Il file e' scritto senza lettere accentate apposta: Windows PowerShell legge
# gli script senza BOM come ANSI, e una "e'" accentata diventerebbe illeggibile.

param(
  [string]$Origine = 'E:\Intrattenimento',
  [string]$Destinazione = 'G:\Il mio Drive\Ciak',
  # 'auto' prova la scheda video (NVIDIA, Intel, AMD) e ripiega sulla CPU;
  # si puo' forzare un encoder, per esempio -Encoder libx264.
  [string]$Encoder = 'auto'
)

$ErrorActionPreference = 'Stop'
$EstensioniVideo = @('.mp4', '.m4v', '.mkv', '.avi', '.mov', '.webm', '.wmv', '.ts', '.m2ts', '.flv', '.mpg', '.mpeg')
$SottotitoliTesto = @('subrip', 'ass', 'ssa', 'mov_text', 'webvtt', 'text')

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
$Lavoro = Join-Path ([IO.Path]::GetTempPath()) 'ciak-conversione'
New-Item -ItemType Directory -Force -Path $Lavoro | Out-Null

Write-Host "Da:  $Origine"
Write-Host "A:   $Destinazione"
if ($Encoder -eq 'libx264') { Write-Host 'Ricodifica: con la CPU (nessuna scheda video utilizzabile trovata)' } else { Write-Host "Ricodifica: con la scheda video ($Encoder)" }
Write-Host ''

$video = Get-ChildItem -LiteralPath $Origine -Recurse -File |
  Where-Object { $EstensioniVideo -contains $_.Extension.ToLower() } |
  Sort-Object FullName

$fatti = 0; $saltati = 0; $errori = 0; $ricodificati = 0
$n = 0
foreach ($f in $video) {
  $n++
  $relativo = $f.DirectoryName.Substring($Origine.Length).TrimStart('\', '/')
  $cartellaDest = if ($relativo) { Join-Path $Destinazione $relativo } else { $Destinazione }
  $nome = [IO.Path]::GetFileNameWithoutExtension($f.Name)
  $dest = Join-Path $cartellaDest "$nome.mp4"
  if (Test-Path -LiteralPath $dest) { $saltati++; continue }

  Write-Host "[$n/$($video.Count)] $relativo\$($f.Name)"
  try {
    $json = & ffprobe -v error -show_entries 'stream=index,codec_type,codec_name,pix_fmt:stream_disposition=attached_pic:stream_tags=language' -of json -- $f.FullName | Out-String
    if ($LASTEXITCODE -ne 0) { throw 'ffprobe non riesce a leggere il file' }
    $flussi = @(($json | ConvertFrom-Json).streams)

    # Il video vero: non la copertina che alcuni MKV portano come "video".
    $v = $flussi | Where-Object { $_.codec_type -eq 'video' -and -not ($_.disposition -and $_.disposition.attached_pic -eq 1) } | Select-Object -First 1
    if (-not $v) { throw 'nessuna traccia video' }
    $audio = @($flussi | Where-Object { $_.codec_type -eq 'audio' })
    $sub = @($flussi | Where-Object { $_.codec_type -eq 'subtitle' -and $SottotitoliTesto -contains $_.codec_name })

    $copiaVideo = ($v.codec_name -eq 'h264') -and ($v.pix_fmt -eq 'yuv420p')
    $copiaAudio = ($audio.Count -gt 0) -and -not ($audio | Where-Object { $_.codec_name -ne 'aac' })

    $tmp = Join-Path $Lavoro "$nome.mp4"
    $audioArg = if ($copiaAudio) { @('-c:a', 'copy') } else { @('-c:a', 'aac', '-b:a', '192k') }
    $mappe = @('-map', "0:$($v.index)", '-map', '0:a?')
    $uscita = @('-sn', '-dn', '-movflags', '+faststart', '-f', 'mp4', $tmp)
    $base = @('-hide_banner', '-loglevel', 'error', '-stats', '-y')
    if ($copiaVideo) {
      $esito = Esegui 'ffmpeg' ($base + @('-i', $f.FullName) + $mappe + @('-c:v', 'copy') + $audioArg + $uscita)
    } else {
      Write-Host "   video $($v.codec_name) $($v.pix_fmt): lo ricodifico in H.264 ($Encoder)..." -ForegroundColor Yellow
      $ricodificati++
      # Con la scheda video anche la lettura (HEVC compreso) passa dalla GPU;
      # se non ci riesce ffmpeg torna da solo alla CPU.
      $lettura = if ($Encoder -eq 'libx264') { @() } else { @('-hwaccel', 'auto') }
      $esito = Esegui 'ffmpeg' ($base + $lettura + @('-i', $f.FullName) + $mappe + (ArgomentiVideo $Encoder) + $audioArg + $uscita)
      if ($esito -ne 0 -and $Encoder -ne 'libx264') {
        # Qualche file la scheda video non lo prende (formati rari, risoluzioni
        # strane): lo si rifa' con la CPU invece di lasciarlo indietro.
        Write-Host "   la scheda video non ce l'ha fatta: riprovo con la CPU..." -ForegroundColor Yellow
        $esito = Esegui 'ffmpeg' ($base + @('-i', $f.FullName) + $mappe + (ArgomentiVideo 'libx264') + $audioArg + $uscita)
      }
    }
    if ($esito -ne 0) { throw 'conversione non riuscita' }

    # I sottotitoli interni: uno per lingua (il primo), con la lingua nel nome.
    $srt = @()
    $usate = @{}
    foreach ($s in $sub) {
      $l = Lingua $s.tags.language
      $chiave = if ($l) { $l } else { "traccia$($s.index)" }
      if ($usate.ContainsKey($chiave)) { continue }
      $usate[$chiave] = $true
      $file = Join-Path $Lavoro "$nome.$chiave.srt"
      if ((Esegui 'ffmpeg' @('-hide_banner', '-loglevel', 'error', '-y', '-i', $f.FullName, '-map', "0:$($s.index)", '-c:s', 'srt', $file)) -eq 0) {
        $srt += $file
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
  } catch {
    $errori++
    Write-Host "   ERRORE: $($_.Exception.Message). Il file su Drive non e' stato creato." -ForegroundColor Red
    Get-ChildItem -LiteralPath $Lavoro -File -Filter "$nome.*" -ErrorAction SilentlyContinue | Remove-Item -ErrorAction SilentlyContinue
  }
}

Write-Host ''
Write-Host "Finito: $fatti pronti per Ciak ($ricodificati ricodificati), $saltati gia' presenti, $errori errori."
if (-not $env:CIAK_SENZA_PAUSA) { Read-Host 'Premi Invio per chiudere' }
