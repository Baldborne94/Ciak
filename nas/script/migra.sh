#!/usr/bin/env bash
# La copia, una volta sola, dal Supabase di prima al database del NAS:
# gli utenti (con le loro password, che restano le stesse), poi struttura,
# regole di accesso e dati delle tabelle di Ciak. Alla fine confronta tabella
# per tabella quante righe ci sono di là e di qua, e lo scrive.
#
# Gira nel container «migra» (vedi docker-compose.yaml) a ogni avvio, ma
# lavora solo se SUPABASE_CLOUD_DB_URL è impostato e qui le tabelle di Ciak
# non ci sono ancora: rilanciarlo non copia due volte.
set -uo pipefail

dici() { echo "[migrazione] $*"; }

if [ -z "${CLOUD:-}" ]; then
  dici "SUPABASE_CLOUD_DB_URL è vuoto: niente da copiare."
  exit 0
fi

# Il proprietario delle tabelle dev'essere «postgres», come su Supabase: è
# l'utente con cui il pannello lancia i file SQL, e un ALTER TABLE su una
# tabella di un altro fallirebbe. Gli utenti invece li scrive l'amministratore.
POSTGRES_URL="${LOCALE/supabase_admin:/postgres:}"

# Il database del NAS può essere ancora in avvio: si aspetta che risponda,
# invece di scambiarlo per un database vuoto.
for _ in $(seq 1 60); do
  psql "$LOCALE" -tAc "select 1" > /dev/null 2>&1 && break
  sleep 2
done
if ! psql "$LOCALE" -tAc "select 1" > /dev/null; then
  dici "ERRORE: il database del NAS non risponde. Guarda il registro di ciak-db e di ciak-prepara."
  exit 1
fi

if [ "$(psql "$LOCALE" -tAc "select to_regclass('public.schema_version') is not null")" = "t" ]; then
  dici "Le tabelle di Ciak qui ci sono già: la copia è stata fatta. Puoi togliere SUPABASE_CLOUD_DB_URL da .env."
  exit 0
fi

if ! psql "$CLOUD" -tAc "select 1" > /dev/null; then
  dici "ERRORE: non riesco a collegarmi al Supabase di prima. Controlla SUPABASE_CLOUD_DB_URL (password compresa) in .env."
  exit 1
fi

# Gli utenti di Supabase devono essere pronti (li crea il login al primo avvio).
for _ in $(seq 1 60); do
  [ "$(psql "$LOCALE" -tAc "select to_regclass('auth.identities') is not null")" = "t" ] && break
  sleep 2
done

cd /lavoro || exit 1
rm -f utenti.csv identita.csv tabelle.sql ripristino.log

UTENTI="instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at"
# Il login legge questi campi come testo: vuoti sì, NULL no («converting NULL
# to string is unsupported», e nessuno entra più).
TESTI="confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current, phone_change, phone_change_token, reauthentication_token"
TESTI_LETTI=$(echo "$TESTI" | sed -E "s/([a-z_]+)/coalesce(\1, '')/g")
IDENTITA="id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at"

dici "1/4 Leggo gli utenti…"
psql "$CLOUD" -v ON_ERROR_STOP=1 -c "\\copy (select $UTENTI, $TESTI_LETTI from auth.users) to 'utenti.csv' csv" || { dici "ERRORE nel leggere gli utenti."; exit 1; }
psql "$CLOUD" -v ON_ERROR_STOP=1 -c "\\copy (select $IDENTITA from auth.identities) to 'identita.csv' csv" || { dici "ERRORE nel leggere le identità."; exit 1; }

dici "2/4 Leggo tabelle, regole e dati…"
pg_dump "$CLOUD" --schema=public --no-owner --no-publications --no-subscriptions -f tabelle.sql || { dici "ERRORE nel leggere le tabelle."; exit 1; }

dici "3/4 Scrivo gli utenti nel NAS…"
psql "$LOCALE" -v ON_ERROR_STOP=1 <<SQL || { dici "ERRORE nello scrivere gli utenti: niente è stato copiato."; exit 1; }
begin;
\\copy auth.users ($UTENTI, $TESTI) from 'utenti.csv' csv
\\copy auth.identities ($IDENTITA) from 'identita.csv' csv
commit;
SQL

dici "4/4 Scrivo tabelle, regole e dati…"
# Senza fermarsi al primo errore: alcuni sono attesi (lo schema «public»
# c'è già). Quello che conta è il confronto delle righe qui sotto.
psql "$POSTGRES_URL" -f tabelle.sql > ripristino.log 2>&1

dici "Confronto, tabella per tabella (Supabase di prima → NAS):"
diverse=0
for t in $(psql "$CLOUD" -tAc "select tablename from pg_tables where schemaname = 'public' order by 1"); do
  di_la=$(psql "$CLOUD" -tAc "select count(*) from public.\"$t\"")
  di_qua=$(psql "$LOCALE" -tAc "select count(*) from public.\"$t\"" 2> /dev/null || echo "MANCA")
  segno="ok"
  [ "$di_la" != "$di_qua" ] && segno="DIVERSA" && diverse=$((diverse + 1))
  printf '  %-28s %8s → %-8s %s\n' "$t" "$di_la" "$di_qua" "$segno"
done
printf '  %-28s %8s → %-8s\n' "(utenti)" "$(psql "$CLOUD" -tAc 'select count(*) from auth.users')" "$(psql "$LOCALE" -tAc 'select count(*) from auth.users')"

if [ "$diverse" -gt 0 ]; then
  dici "ATTENZIONE: $diverse tabelle non tornano. Gli errori del ripristino sono in dati/migrazione/ripristino.log."
  grep -i "error" ripristino.log | head -20
  exit 1
fi
# Le iscrizioni alle notifiche sono del vecchio indirizzo (e delle sue chiavi
# VAPID): da qui non arriverebbero mai. Si rifanno dal NAS, una per dispositivo.
psql "$LOCALE" -qc "delete from public.push_subscriptions" && dici "Iscrizioni alle notifiche tolte: si riattivano da ogni dispositivo, dal nuovo indirizzo."
# I file letti contengono i tuoi dati e le password cifrate: servivano solo ora.
rm -f utenti.csv identita.csv tabelle.sql
dici "Fatto: tutto copiato. Ora togli SUPABASE_CLOUD_DB_URL da .env."
