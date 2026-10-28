# Aggiornamento automatico da GitHub

Il server scarica da solo le nuove versioni da GitHub (`giovannistack/wish-ticket`, branch `main`) ogni 5 minuti, le compila e riavvia l'app. Da fare una volta sola, come Amministratore.

## 1. Collegare la cartella del progetto a GitHub

In PowerShell:

```powershell
cd C:\Users\Administrator\Documents\Git\wish-ticket
git init
git remote add origin https://github.com/giovannistack/wish-ticket
git fetch origin main
git checkout -f -B main origin/main
git status
```

`.env`, `data`, `node_modules` e `dist` restano dove sono: non sono su GitHub.

## 2. Attività pianificata

```powershell
schtasks /Create /TN "Wish Ticket aggiorna app" /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\Users\Administrator\Documents\Git\wish-ticket\deploy\windows\aggiorna-app.ps1" /SC MINUTE /MO 5 /RU Administrator /RP * /RL HIGHEST /F
```

Chiede la password di Administrator. Usa le credenziali GitHub già salvate per Administrator (le stesse di pcretrolab).

## 3. Verifica

```powershell
schtasks /Run /TN "Wish Ticket aggiorna app"
Get-Content C:\wish-ticket\logs\aggiornamenti.log -Tail 20
```

Il registro scrive una riga solo quando arriva una versione nuova o in caso di errore.

## Se qualcosa va storto

- Una versione che non compila o non parte viene annullata: l'app torna alla versione precedente e resta online. La versione scartata è in `C:\wish-ticket\versione-scartata.txt` e non viene riprovata; la successiva pubblicata su GitHub sì.
- `ATTENZIONE: anche il ripristino non e riuscito` nel registro = serve un controllo a mano (`C:\wish-ticket\logs\wish-ticket.log`).
- Sospendere gli aggiornamenti: `schtasks /Change /TN "Wish Ticket aggiorna app" /Disable` (riattivare con `/Enable`).
