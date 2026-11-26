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
set -uo pipefail

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
else
  echo "[prepara] ERRORE: non riesco a impostare le password del database (POSTGRES_PASSWORD è cambiata dopo il primo avvio?)."
  exit 1
fi
