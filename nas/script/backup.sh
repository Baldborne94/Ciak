#!/usr/bin/env bash
# Una copia del database ogni notte alle 4, in dati/backup sul NAS. Prima
# i backup li faceva Supabase; ora che i dati stanno qui, li fa questo.
# Le copie più vecchie di GIORNI giorni si cancellano. Una copia si rimette
# con: psql … -f ciak-AAAA-MM-GG.sql (vedi LEGGIMI.md).
set -uo pipefail

copia() {
  local file="/backup/ciak-$(date +%F).sql.gz"
  if pg_dump "$LOCALE" --schema=public --schema=auth | gzip > "$file.tmp"; then
    mv "$file.tmp" "$file"
    echo "[backup] $(date '+%F %T') copia fatta: $(basename "$file") ($(du -h "$file" | cut -f1))"
  else
    rm -f "$file.tmp"
    echo "[backup] $(date '+%F %T') ERRORE: copia non riuscita"
  fi
  find /backup -name 'ciak-*.sql.gz' -mtime +"${GIORNI:-30}" -delete
}

# Al primo avvio una copia subito, così non si aspetta una notte per averne una.
ls /backup/ciak-*.sql.gz > /dev/null 2>&1 || copia
# Quanto manca alle 4 di notte, in secondi. Il «date» di questo container è
# quello di BusyBox, che non capisce «tomorrow 04:00»: si fa il conto a mano,
# sull'ora locale (TZ). Mai zero o negativo: un errore qui farebbe copie in
# ciclo continuo.
alle_quattro() {
  local h m s ora
  h=$(date +%H); m=$(date +%M); s=$(date +%S)
  ora=$((10#$h * 3600 + 10#$m * 60 + 10#$s))
  local attesa=$(((4 * 3600 - ora + 86400) % 86400))
  [ "$attesa" -le 0 ] && attesa=86400
  echo "$attesa"
}

while true; do
  sleep "$(alle_quattro)"
  copia
done
