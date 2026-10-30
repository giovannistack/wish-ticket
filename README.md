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
- Stati: **In lavorazione** (ogni ticket nasce così), **In attesa cliente**, **Risolto**, **Chiuso**. I ticket senza tecnico sono "Da assegnare" in dashboard (riquadro, filtro, righe evidenziate, avviso dei bloccanti).
- "Prendi in carico" assegna il ticket a chi lo prende. Per segnare risolto serve la soluzione, che il cliente riceve via email.
- Email automatica al cliente alla prima assegnazione ("se ne occupa…") e a ogni cambio di stato (in attesa cliente, di nuovo in lavorazione, risolto, chiuso, riaperto).
- Intervento: da remoto, on-site (presso il cliente), presso il nostro laboratorio.
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

**Allegati, ticket da Wish, registro modificabile**
- Foto (JPG, PNG, WEBP) e PDF fino a 10 MB su ogni ticket, anche al momento dell'apertura (fino a 5 file). Il tipo si controlla dal contenuto del file, non dal nome.
- Il cliente vede i propri allegati e quelli di Wish visibili, con la nota; Wish vede tutto. Accanto a ogni file Wish ha un interruttore "Visibile al cliente / Non visibile al cliente" che cambia con un clic. Quando un documento di Wish diventa visibile, il cliente riceve una email.
- I file stanno in `data/allegati` (o in `CARTELLA_ALLEGATI`), mai accessibili senza accesso: si scaricano solo dall'app, con i permessi dell'utente. `aggiorna.bat` li conserva, `backup.bat` li copia.
- Il super admin apre ticket per conto di un cliente (azienda, richiedente, stesso modulo) e può aprirli fuori contratto.
- Il super admin modifica le righe del registro chiamate (motivo e numero), scegliendo se aggiornare anche il saldo.

**Tipologie di cliente: aziende con e senza contratto, privati**
- In registrazione il menu "La tua azienda" offre le aziende già clienti, **+ Inserisci nuova azienda** (denominazione e partita IVA di 11 cifre, obbligatorie) e **Privato** (senza ufficio, "Email" al posto di "Email aziendale"). Il telefono è obbligatorio per tutti; l'ufficio resta facoltativo.
- L'elenco pubblico della registrazione mostra solo le aziende, mai i privati.
- All'attivazione Wish vede cosa ha dichiarato l'utente (con P.IVA, email e telefono cliccabili) e sceglie: cliente esistente, nuova azienda senza contratto, nuovo cliente privato.
- Ogni cliente ha una tipologia: **azienda con contratto**, **azienda senza contratto**, **cliente privato**. Si vede con un bollino in dashboard, Utenti e accessi e Clienti, e si può filtrare. Un privato è un cliente a sé: vede solo i propri ticket.
- I ticket di clienti senza contratto e privati sono sempre fuori contratto e non vengono mai bloccati. Un privato non può avere un contratto a chiamate.
- La pagina Aziende si chiama ora **Clienti**: cerca per nome o P.IVA e crea anche clienti privati.

**Messaggi con il cliente**
- Nel ticket, riquadro "Messaggi": una conversazione visibile a Wish e al cliente (e ai colleghi della sua azienda). Le note interne restano separate e mai visibili al cliente.
- Quando scrive Wish: email al richiedente, in copia alla casella assistenza (`EMAIL_AVVISI_ADMIN`) e al tecnico assegnato. Quando risponde il cliente dal portale: email alla casella assistenza, in copia al tecnico.
- A ticket chiuso il cliente non può più scrivere (per un nuovo problema apre un nuovo ticket). Le pagine del ticket si aggiornano da sole.

**Rapportino di intervento (modulo Wish IT)**
- Nel ticket, sezione "Rapportino di intervento": righe di intervento (data, inizio, fine, viaggio, tipologia), parti utilizzate con costo, importo totale intervento, note stampate sul rapportino. Il tempo del ticket è la somma delle righe.
- Firma con il dito (tecnico e responsabile cliente) su telefono o tablet; in alternativa il PDF si stampa e si firma a penna. Se il contenuto cambia dopo la firma, le firme vengono annullate.
- PDF identico al modulo cartaceo (logo, intestazione Wish IT, N.° = numero del ticket, dati cliente con indirizzo e P.IVA, descrizione = soluzione). Lo scarica Wish in ogni momento; il cliente dalla scheda del ticket quando è risolto o chiuso, e lo riceve allegato all'email di risoluzione.
- Intestazione aziendale in `apps/api/src/lib/pdfRapporto.ts` (`WISH_IT`), logo in `apps/api/assets/logo-wish-it.png`.

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

## Produzione (Windows Server) e aggiornamenti automatici

L'app è online su **https://www.portalewish.com**, sul server 192.168.0.73.

- Progetto: `C:\Users\Administrator\Documents\Git\wish-ticket`, una copia del repository GitHub `giovannistack/wish-ticket` (branch `main`). Non si modifica a mano: viene riallineata a GitHub.
- Fuori da GitHub, e mai toccati dagli aggiornamenti: `.env`, `data\allegati`, `node_modules`, `dist`.
- Servizi Windows (NSSM, `C:\wish-ticket\bin`): **WishTicket** (Node 24 su 127.0.0.1:8040) e **WishTicketCaddy** (HTTPS su 80/443, config `C:\wish-ticket\Caddyfile`, che serve anche pcretrolab.it verso Apache su 8080).
- Log: `C:\wish-ticket\logs` (`wish-ticket.log`, `caddy-servizio.log`, `aggiornamenti.log`).

**Aggiornamento automatico.** L'attività pianificata "Wish Ticket aggiorna app" lancia ogni 5 minuti `deploy\windows\aggiorna-app.ps1`. Se su `main` c'è una versione nuova: scarica, reinstalla i pacchetti se sono cambiati, compila, riavvia WishTicket e controlla `/api/salute`. Se qualcosa fallisce torna alla versione precedente, scrive l'errore in `aggiornamenti.log` e non riprova quella versione finché non ne arriva una nuova. Installazione: `deploy/windows/ISTRUZIONI-AGGIORNAMENTO.md`.

Quindi, per pubblicare una modifica: test verdi, commit, push su `main`. Entro 5-10 minuti è online.

Altro sul server:
- `deploy\windows\installa-servizi.bat` (come Amministratore) crea o riallinea i due servizi.
- `deploy\windows\backup.bat`: backup notturno del database e degli allegati (comando di pianificazione in testa al file).
- In produzione `JWT_SECRET` è obbligatorio (almeno 32 caratteri).

## Note tecniche

- **bcryptjs** al posto di `bcrypt`: stesso algoritmo e stessi hash, ma in puro JavaScript. Su Windows non servono strumenti di compilazione.
- Font Plus Jakarta Sans **incluso nell'app** (non da Google Fonts): nessuna chiamata esterna, più semplice per la privacy.
- I refresh token scaduti vengono cancellati all'avvio e ogni 6 ore.
- Header di sicurezza con Helmet. HSTS e `upgrade-insecure-requests` sono attivi solo con `NODE_ENV=production`.
