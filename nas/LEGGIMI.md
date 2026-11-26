# Ciak sul NAS

Tutto Ciak in casa: l'app, i tuoi dati (liste, voti, visti, diario) e i loro
backup stanno sul NAS, accanto a Jellyfin. Fuori restano solo i servizi da cui
Ciak prende le informazioni: il catalogo di TMDB, Claude per le funzioni AI,
OpenSubtitles per i sottotitoli.

Si apre da `https://<nome del NAS>.<tua rete>.ts.net:8443`, attraverso
Tailscale: lo stesso indirizzo di Jellyfin, con `:8443` in fondo.

## Cosa gira

| Container | Cosa fa |
| --- | --- |
| `ciak` | L'app, le funzioni che stavano su Vercel, la porta verso il database |
| `ciak-db` | Il database (PostgreSQL di Supabase) |
| `ciak-auth` | Il login, con email e password di sempre |
| `ciak-rest` | Le tabelle, con le stesse regole di accesso di prima |
| `ciak-studio`, `ciak-meta` | Il pannello di Supabase, per i file SQL (`:8444`) |
| `ciak-backup` | Una copia del database ogni notte alle 4, in `dati/backup` |
| `ciak-prepara` | A ogni avvio, le password interne del database; poi si ferma |
| `ciak-migra` | La copia dei dati dal Supabase di prima, una volta sola; poi si ferma |
| `ciak-aggiorna` | Scarica le versioni nuove di Ciak da sola, ogni ora |

Su un DXP2800 con 8 GB tutto insieme usa circa 700 MB di memoria (il pannello da solo la metà).

## Prima volta

### 1. La cartella

Sul NAS, nella cartella condivisa `docker` (quella dove c'è già `tailscale`),
crea una cartella `ciak` e copiaci dentro il contenuto della cartella `nas/` di
questo progetto: `docker-compose.yaml`, `chiavi.html` e la cartella
`script`.

Il modo più semplice: su GitHub, pagina del progetto → «Code» → «Download ZIP»,
apri lo ZIP e copia la cartella `nas` così com'è.

### 2. Il file delle impostazioni

Apri `chiavi.html` con un doppio clic (si apre nel browser, lavora senza
internet: niente lascia il PC) e compila i campi:

- **Indirizzo di Ciak**: quello Tailscale del NAS, con `:8443` in fondo.
- **Le chiavi dei servizi**: su Vercel non si rileggono, quindi si prendono
  dai servizi stessi (la pagina dice dove). Quella di Anthropic va creata
  nuova. Le chiavi delle notifiche lasciale vuote: le crea la pagina.
- **La copia dei tuoi dati**: su supabase.com → progetto → «Connect» →
  «Session pooler» → l'indirizzo `postgresql://…`, con la password del
  database al posto di `[YOUR-PASSWORD]`.

Premi «Crea il file», poi «Scarica»: arriva `env.txt`. Mettilo nella cartella
`docker/ciak` del NAS e rinominalo **`.env`** (col punto davanti, senza
estensione).

Il `.env` contiene le password del database: non mandarlo a nessuno e non
metterlo su GitHub.

### 3. Tailscale

Nella cartella `docker/tailscale` apri `serve.json` (di solito in `config`)
col Blocco note e mettici questo (Jellyfin resta com'era, sulla 443).

Prima guarda cosa c'è già: se una porta è usata da un altro servizio (per
esempio la 8443 da Navidrome), lascia quella com'è e scegline un'altra per
Ciak, e usa la stessa nell'indirizzo del `.env` (`INDIRIZZO_PUBBLICO`).

```json
{
  "TCP": {
    "443": { "HTTPS": true },
    "8443": { "HTTPS": true },
    "8444": { "HTTPS": true }
  },
  "Web": {
    "${TS_CERT_DOMAIN}:443": { "Handlers": { "/": { "Proxy": "http://127.0.0.1:8899" } } },
    "${TS_CERT_DOMAIN}:8443": { "Handlers": { "/": { "Proxy": "http://127.0.0.1:8900" } } },
    "${TS_CERT_DOMAIN}:8444": { "Handlers": { "/": { "Proxy": "http://127.0.0.1:8901" } } }
  }
}
```

Poi nell'app Docker del NAS riavvia il progetto `tailscale`.

### 4. Avvio

Nell'app Docker del NAS: «Progetto» → «Crea» → come percorso la cartella
`docker/ciak` (trova da sé `docker-compose.yaml`) → avvia.

La prima volta scarica circa 2 GB di immagini: qualche minuto.

### 5. La copia dei dati

Apri il registro del container `ciak-migra`. Alla fine deve dire:

```
[migrazione] Fatto: tutto copiato. Ora togli SUPABASE_CLOUD_DB_URL da .env.
```

con l'elenco delle tabelle e, per ognuna, quante righe c'erano prima e quante
ci sono ora. Se una non torna lo dice, e il dettaglio sta in
`dati/migrazione/ripristino.log`.

Fatto questo, togli il valore di `SUPABASE_CLOUD_DB_URL` dal `.env` (contiene
la password del Supabase di prima e non serve più).

### 6. Entra

Apri `https://<nome del NAS>.<tua rete>.ts.net:8443` ed entra con la tua email
e la password di sempre: gli utenti sono copiati con le loro password.

Su ogni dispositivo:

- **installa di nuovo l'app** dal nuovo indirizzo (quella vecchia era legata a
  Vercel);
- **ricollega il server di casa** (Videoteca → «Collega il server di casa»), e
  sul PC la cartella;
- **riattiva le notifiche** (Impostazioni), se le usavi;
- **i film salvati in Ciak vanno salvati di nuovo**: le copie stanno nel
  browser, legate all'indirizzo da cui le hai salvate.

Da qui in avanti usa solo l'indirizzo del NAS: i dati scritti su quello
vecchio (Vercel) finirebbero nel Supabase di prima, non qui.

### 7. Spegnere Vercel e Supabase

Dopo qualche giorno senza problemi:

- su supabase.com metti in pausa il progetto (o eliminalo);
- su vercel.com elimina il progetto Ciak.

## Ogni giorno

**Aggiornamenti.** Quando una modifica entra in `main`, GitHub costruisce
l'immagine nuova e `ciak-aggiorna` la scarica entro un'ora, poi riavvia solo
`ciak`. Il database resta acceso.

Se `ciak-aggiorna` dice che non può scaricare `ghcr.io/baldborne94/ciak`, il
pacchetto su GitHub è privato: su GitHub → il tuo profilo → «Packages» →
`ciak` → «Package settings» → «Change visibility» → «Public». Nell'immagine non
c'è nessuna chiave: le chiavi stanno solo nel `.env` sul NAS.

**Schema del database.** Quando arriva un file nuovo `supabase/schema_vN_*.sql`
(Ciak lo dice in cima alla pagina), aprilo e lancialo nel pannello:
`https://<nome del NAS>.<tua rete>.ts.net:8444` → «SQL Editor».

**Backup.** In `docker/ciak/dati/backup`, uno per notte (`ciak-AAAA-MM-GG.sql.gz`),
tenuti 30 giorni (`BACKUP_GIORNI` nel `.env` per cambiarlo). Sono file normali:
puoi copiarli anche altrove. Per rimetterne uno, ferma `ciak`, poi dal
terminale del container `ciak-db`:

```
gunzip -c /percorso/ciak-AAAA-MM-GG.sql.gz | psql -U supabase_admin -d postgres
```

**Password dimenticata.** L'email di reimpostazione parte solo con una casella
da cui spedirla: aggiungi al `.env` `SMTP_HOST`, `SMTP_PORT`, `SMTP_UTENTE`,
`SMTP_PASSWORD` e `SMTP_EMAIL` (per Gmail: `smtp.gmail.com`, `587`, la tua
email, una «password per le app»). Senza, tutto il resto funziona lo stesso.

## Se qualcosa non va

- **La pagina non si apre**: il progetto `ciak` è avviato? E `tailscale`, con
  la 8443 in `serve.json`?
- **«Il database di Ciak non risponde»**, o `ciak-auth` e `ciak-rest` che si
  riavviano in continuazione: guarda il registro di `ciak-prepara`, poi di
  `ciak-db` e `ciak-auth`.
- **La copia dice «password authentication failed for user postgres»**: è la
  password del Supabase di prima, in `SUPABASE_CLOUD_DB_URL`. Rimettila (sole
  lettere e numeri: i simboli rompono l'indirizzo) e riavvia `ciak-migra`.
- **Le funzioni AI, i sottotitoli o il catalogo non vanno**: manca la chiave
  nel `.env`. Dopo averla aggiunta, riavvia il progetto.
- Dalla rete di casa Ciak si apre anche da `http://<IP del NAS>:8900`, ma senza
  https il browser spegne notifiche e uso offline: meglio l'indirizzo Tailscale.
