#!/usr/bin/env bash
# Le password con cui il login (supabase_auth_admin), le tabelle
# (authenticator), il pannello e la migrazione entrano nel database: tutte
# uguali a POSTGRES_PASSWORD, rimesse a ogni avvio prima che gli altri partano.
#
# Prima lo faceva un file .sql letto dal database alla sua prima accensione.
# Sul NAS UGREEN i file copiati nella cartella non erano leggibili dal
# database («Permission denied»): la preparazione si fermava lì, e login e
# tabelle restavano fuori per sempre («password authentication failed»).
# Qui la password arriva dall'ambiente, nessun file da leggere, e un
# database già creato si ripara da solo al prossimo avvio.
#
# Finito il lavoro resta acceso senza far niente, e il controllo di salute
# dice «pronto»: login e tabelle aspettano quello. Uscire andava bene a
# Docker, ma l'app Docker del NAS chiama «Errore» un progetto con un
# container fermo, e un «Errore» fisso nasconde quelli veri. Se qualcosa va
# storto invece esce con un errore, e Docker riprova.
set -uo pipefail

rm -f /run/ciak/pronta

for _ in $(seq 1 60); do
  pg_isready -h db -U supabase_admin -q && break
  sleep 2
done

if psql -h db -U supabase_admin -d postgres -q -v ON_ERROR_STOP=1 -v pw="$PGPASSWORD" <<'SQL'
alter user supabase_admin with password :'pw';
alter user postgres with password :'pw';
alter user supabase_auth_admin with password :'pw';
alter user authenticator with password :'pw';
alter database postgres set "app.settings.jwt_exp" to '3600';
SQL
then
  echo "[prepara] Password del database pronte."
  mkdir -p /run/ciak && touch /run/ciak/pronta
  trap 'exit 0' TERM INT
  while true; do sleep 3600 & wait $!; done
else
  echo "[prepara] ERRORE: non riesco a impostare le password del database (POSTGRES_PASSWORD è cambiata dopo il primo avvio?)."
  exit 1
fi
