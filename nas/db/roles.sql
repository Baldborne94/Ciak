-- Le password dei ruoli con cui login e tabelle entrano nel database: la
-- stessa di POSTGRES_PASSWORD (come nel Supabase ufficiale in Docker).
\set pgpass `echo "$POSTGRES_PASSWORD"`

ALTER USER authenticator WITH PASSWORD :'pgpass';
ALTER USER supabase_auth_admin WITH PASSWORD :'pgpass';
