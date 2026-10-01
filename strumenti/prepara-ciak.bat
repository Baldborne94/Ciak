@echo off
rem Avvia prepara-ciak.ps1, che sta nella stessa cartella di questo file.
rem PowerShell non esegue gli script con un doppio clic: questo file si.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0prepara-ciak.ps1"
if errorlevel 1 pause
