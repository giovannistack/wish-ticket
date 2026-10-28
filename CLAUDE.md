# Wish Ticket – note per lo sviluppo

Ticketing di assistenza Wish S.r.l. Monorepo npm workspaces: `packages/shared` (schemi Zod e tipi), `apps/api` (Fastify 5 + Mongoose), `apps/web` (React 19 + Vite + Tailwind 4). Testi dell'interfaccia e del codice in italiano.

## Pubblicazione
- `main` = produzione (https://www.portalewish.com). Il server scarica `main` ogni 5 minuti, compila e riavvia; se la build o l'avvio falliscono torna alla versione precedente (`deploy/windows/aggiorna-app.ps1`).
- Prima di ogni push su `main`: `npm run build` e `npm test` verdi. Niente segreti nel repository (`.env` resta sul server).
- Una nuova variabile d'ambiente obbligatoria va aggiunta a `.env.example` e comunicata: il server non la riceve da GitHub.
- Una modifica al Caddyfile non arriva da sola: quello in uso è `C:\wish-ticket\Caddyfile` (serve anche pcretrolab.it).

## Test
- `npm test` (Vitest, `app.inject`) richiede un MongoDB su 127.0.0.1:27017 (o `MONGO_URI_TEST`). Ogni file crea e cancella un database usa e getta.
- I test di separazione tra aziende (`apps/api/test/separazione.test.ts`) non vanno mai indeboliti.

## Regole di dominio
- Ogni cliente vede solo la propria azienda: filtro `scoped(req)`, azienda presa dal token e mai dal body; ticket di altre aziende = 404.
- Ruoli: `admin` (Wish), `referente`, `utente`; flag `superAdmin` per le azioni riservate (eliminare ticket, team, aziende e contratti, registro chiamate).
- Contratti: chiamate scalate in modo atomico; ogni movimento finisce nel registro `movimentiContratto`.
