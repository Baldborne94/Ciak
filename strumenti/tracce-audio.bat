@echo off
rem Prepara le lingue dell'audio dei video gia' su Drive, per il menu Audio di Ciak.
rem Sta nella stessa cartella di prepara-ciak.ps1.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0prepara-ciak.ps1" -SoloTracceAudio
if errorlevel 1 pause
