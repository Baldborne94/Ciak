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
  [string]$Destinazione = 'G:\Il mio Drive\Ciak'
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
$Lavoro = Join-Path ([IO.Path]::GetTempPath()) 'ciak-conversione'
New-Item -ItemType Directory -Force -Path $Lavoro | Out-Null

Write-Host "Da:  $Origine"
Write-Host "A:   $Destinazione"
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
    $argomenti = @('-hide_banner', '-loglevel', 'error', '-stats', '-y', '-i', $f.FullName, '-map', "0:$($v.index)", '-map', '0:a?')
    if ($copiaVideo) {
      $argomenti += @('-c:v', 'copy')
    } else {
      Write-Host "   video $($v.codec_name) $($v.pix_fmt): lo ricodifico in H.264, ci vuole un po'..." -ForegroundColor Yellow
      $argomenti += @('-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p')
      $ricodificati++
    }
    if ($copiaAudio) { $argomenti += @('-c:a', 'copy') } else { $argomenti += @('-c:a', 'aac', '-b:a', '192k') }
    $argomenti += @('-sn', '-dn', '-movflags', '+faststart', '-f', 'mp4', $tmp)
    if ((Esegui 'ffmpeg' $argomenti) -ne 0) { throw 'conversione non riuscita' }

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
