@echo off
rem Aggiunge a un film gia' su Drive la lingua di un'altra versione dello stesso film.
rem Trascina su questo file il video (o piu' video) con la lingua da aggiungere.
rem Sta nella stessa cartella di prepara-ciak.ps1.
if "%~1"=="" (
  echo Trascina su questo file il video con la lingua da aggiungere, per esempio il film in italiano.
  pause
  exit /b 1
)
for %%F in (%*) do powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0prepara-ciak.ps1" -AggiungiLingua "%%~F"
pause
