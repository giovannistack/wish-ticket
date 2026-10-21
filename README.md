# Wish Ticket

Web app di ticketing per l'assistenza tecnica Wish. Tre aziende clienti (MODO SPA, RGR Components S.r.l., Riserva Naturale Canale Monterano) aprono ticket, e ognuna vede solo i propri. L'admin Wish attiva gli account e gestisce i ticket dalla dashboard.

## Stato: fasi 1 e 3 completate

- Registrazione con conferma email. L'account resta **in attesa** finché l'admin non lo attiva e non conferma l'azienda.
- Accesso con access token da 15 minuti e refresh token revocabile in cookie httpOnly. Recupero password via email.
- **Separazione tra aziende** applicata dal server (`scoped(req)`), coperta da test automatici.
- Ruoli: `admin` (Wish), `referente` e `utente` (dipendente). Referente e dipendenti vedono tutti i ticket della propria azienda.
- Apertura ticket con numero automatico `TK-2026-0001`, conferma via email al cliente e avviso all'admin (in evidenza se bloccante).
- Area cliente: elenco ticket, nuovo ticket, dettaglio.
- Area admin: dashboard ticket con filtri per azienda e stato, utenti e accessi (attiva, rifiuta, disattiva).
- Senza SMTP configurato, le email non vengono inviate ma scritte nel log, con il link (comodo in sviluppo).

**Fase 3 – gestione dei ticket (admin)**
- Pannello Gestione nel dettaglio ticket: stato, priorità, tecnico, intervento (remoto/on-site), tempo impiegato, soluzione.
- "Prendi in carico" assegna il ticket a chi lo prende. Per segnare risolto serve la soluzione, che il cliente riceve via email.
- Email automatica al cliente a ogni cambio di stato (in carico, in attesa cliente, risolto, chiuso, riaperto).
- Note interne, mai visibili ai clienti. Storico completo di ogni modifica per l'admin; il cliente vede solo apertura, assegnazione e cambi di stato.
- Dashboard: colonna tecnico e filtro "Assegnati a me".
- Utenti e accessi: riquadro "Rifiutati e disattivati" con "Rimetti in attesa" ed "Elimina" (solo per chi non ha aperto ticket).
- **Super admin**: il primo admin creato (in un'installazione esistente lo diventa da solo al primo avvio). È l'unico che crea, modifica, disattiva ed elimina gli account del team, e l'unico che può eliminare i ticket. Il suo account non lo può toccare nessun altro. Gli altri tecnici gestiscono ticket e clienti e possono cambiare solo la propria password.
- Pagina **Team Wish**: il super admin crea a mano gli altri admin/tecnici (nome, email, password), cambi la password, li disattivi o elimini. La password non viene mai mandata per email.
- Quando assegni un ticket a un collega, lui riceve una email con i dettagli, in copia a `EMAIL_AVVISI_ADMIN` (es. assistenza@wishsrl.it).
- Eliminazione dei ticket (dalla dashboard o dal dettaglio) e degli utenti, anche attivi: i ticket di un utente eliminato restano, con il richiedente "Utente eliminato".

**Aziende e contratti** (pagina Aziende)
- Il super admin crea e modifica le aziende clienti; una nuova azienda compare subito nella registrazione.
- Contratto annuale per azienda: chiamate incluse e periodo. Ogni ticket aperto dal cliente scala una chiamata in automatico.
- Spunta "Fuori contratto" nel ticket (solo super admin): restituisce la chiamata; togliendola la riscala. Eliminare un ticket a contratto restituisce la chiamata.
- Rettifiche manuali con motivo (es. chiamata abbonata), rinnovo annuale, sblocco di emergenza per N richieste fuori contratto.
- A chiamate finite il cliente non può aprire ticket (lo vede in app) e l'admin riceve una email.
- Registro chiamate per azienda: ogni movimento con data, autore, ticket e saldo. Il super admin può eliminare una riga, scegliendo se ripristinare anche il saldo; la riga eliminata resta nel registro interno delle attività.

**Prossime fasi**: messaggi e allegati nei ticket (2), notifiche push/SSE e comunicazioni (4), report, apparati e collegamento con il calendario interventi (5).

## Struttura

```
apps/web        React 19 + Vite + Tailwind 4 + TanStack Query + React Router
apps/api        Fastify 5 + Mongoose + Zod
packages/shared schemi Zod e tipi comuni a web e API
deploy/windows  Caddyfile, servizi NSSM, aggiornamento, backup
deploy/docker   Dockerfile e compose per Linux
```

## Il file .env

L'app legge da sola il file `.env` nella cartella principale, con qualunque comando di avvio (`npm start`, `node apps/api/dist/server.js`, servizio NSSM). Le variabili già impostate nel sistema hanno la precedenza.

## Sviluppo

Requisiti: Node **22.22+** (in produzione Node 24 LTS) e un MongoDB raggiungibile.

```bash
npm install
cp .env.example .env        # in sviluppo bastano MONGO_URI e, se vuoi, EMAIL_AVVISI_ADMIN
ADMIN_EMAIL=tu@wishsrl.it ADMIN_PASSWORD=UnaPassword123 npm run seed:dev
npm run dev:api             # API su http://127.0.0.1:8040
npm run dev:web             # app su http://localhost:5173 (inoltra /api all'API)
```

`npm run seed` crea le tre aziende e l'admin. Si può rilanciare: non duplica nulla.

## Test

```bash
npm test                    # usa mongodb://127.0.0.1:27017 (o MONGO_URI_TEST)
```

Ogni file di test crea un database usa e getta e lo cancella alla fine. I test più importanti sono in `apps/api/test/separazione.test.ts`: tre aziende, referente e dipendente per ognuna, e controlli incrociati (404 sui ticket altrui, azienda presa dal token e mai dal body, rotte admin chiuse ai clienti, trasferimento di un utente tra aziende).

## Messa in produzione (Windows Server)

1. Installa **Node 24 LTS**, poi metti `nssm.exe` e `caddy.exe` in `C:\wish-ticket\bin`.
2. Crea su MongoDB il database `wish_ticket` con un utente dedicato:
   ```js
   use wish_ticket
   db.createUser({ user: "wish_ticket", pwd: "…", roles: [{ role: "readWrite", db: "wish_ticket" }] })
   ```
3. Copia il progetto in `C:\wish-ticket\app`, crea `.env` da `.env.example` e compila **tutte** le voci (JWT_SECRET, SMTP, URL_PUBBLICO…).
4. Dentro `C:\wish-ticket\app`:
   ```bat
   npm ci
   npm run build
   npm run seed
   ```
5. Punta il DNS di `ticket.wishsrl.it` all'IP del server (o cambia il dominio nel `Caddyfile`).
6. Come Amministratore: `deploy\windows\installa-servizi.bat`. Installa e avvia due servizi Windows (Node e Caddy) che ripartono da soli, e apre le porte 80 e 443.
7. Pianifica il backup notturno (il comando è in testa a `deploy\windows\backup.bat`).

Per gli aggiornamenti: copia la nuova versione in `C:\wish-ticket\nuova` e lancia `deploy\windows\aggiorna.bat`. Lo script compila prima di fermare il servizio e tiene la versione precedente in `C:\wish-ticket\precedente`.

Su Linux: `docker compose -f deploy/docker/compose.yml --env-file .env up -d --build`, con Caddy o un altro proxy HTTPS davanti.

## Note tecniche

- **bcryptjs** al posto di `bcrypt`: stesso algoritmo e stessi hash, ma in puro JavaScript. Su Windows non servono strumenti di compilazione.
- Font Plus Jakarta Sans **incluso nell'app** (non da Google Fonts): nessuna chiamata esterna, più semplice per la privacy.
- I refresh token scaduti vengono cancellati all'avvio e ogni 6 ore.
- Header di sicurezza con Helmet. HSTS e `upgrade-insecure-requests` sono attivi solo con `NODE_ENV=production`.
