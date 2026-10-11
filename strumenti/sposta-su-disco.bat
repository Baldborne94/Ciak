@echo off
rem Copia la videoteca da Google Drive al disco esterno, cartelle comprese.
rem Si puo' interrompere e rilanciare: i file gia' copiati si saltano.
rem Da Drive non cancella niente: lo fai tu, quando hai controllato il disco.
set /p LETTERA=Lettera del disco esterno (per esempio F): 
if "%LETTERA%"=="" exit /b 1
if not exist "%LETTERA%:\" (
  echo Non trovo il disco %LETTERA%: - e' attaccato?
  pause
  exit /b 1
)
robocopy "G:\Il mio Drive\Ciak" "%LETTERA%:\Ciak" /E /XO /R:3 /W:10 /NP /TEE /LOG+:"%~dp0sposta-su-disco.log"
if errorlevel 8 (
  echo.
  echo Alcuni file non sono stati copiati: l'elenco e' in sposta-su-disco.log. Rilancia per riprovare.
) else (
  echo.
  echo Fatto: la videoteca e' in %LETTERA%:\Ciak
)
pause
