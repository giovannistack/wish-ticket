@echo off
REM ============================================================
REM  Wish Ticket - servizi Windows con NSSM (app e Caddy).
REM  Come Amministratore. Si puo' rilanciare: se i servizi esistono
REM  ne aggiorna la configurazione.
REM  Prerequisiti: Node 24 LTS, nssm.exe e caddy.exe in C:\wish-ticket\bin
REM ============================================================
setlocal
set BASE=C:\wish-ticket
REM Cartella del progetto: due livelli sopra questo script (deploy\windows)
for %%I in ("%~dp0..\..") do set APP=%%~fI
set NSSM=%BASE%\bin\nssm.exe
REM Node attivo (funziona anche con nvm)
for /f "delims=" %%N in ('where node') do if not defined NODE set NODE=%%N
if not defined NODE (
  echo Node non trovato nel PATH.
  exit /b 1
)
echo Progetto: %APP%
echo Node:     %NODE%

if not exist "%BASE%\logs" mkdir "%BASE%\logs"
REM Il Caddyfile in uso sta fuori dal progetto: si crea dal modello solo la prima volta
if not exist "%BASE%\Caddyfile" copy "%APP%\deploy\windows\Caddyfile" "%BASE%\Caddyfile" >nul

REM --- Servizio Node (app web + API) ---
%NSSM% status WishTicket >nul 2>&1 || %NSSM% install WishTicket "%NODE%"
%NSSM% set WishTicket Application "%NODE%"
%NSSM% set WishTicket AppParameters "%APP%\apps\api\dist\server.js"
%NSSM% set WishTicket AppDirectory "%APP%"
%NSSM% set WishTicket DisplayName "Wish Ticket (app e API)"
%NSSM% set WishTicket Start SERVICE_AUTO_START
%NSSM% set WishTicket AppStdout "%BASE%\logs\wish-ticket.log"
%NSSM% set WishTicket AppStderr "%BASE%\logs\wish-ticket.log"
%NSSM% set WishTicket AppRotateFiles 1
%NSSM% set WishTicket AppRotateBytes 10485760
%NSSM% set WishTicket AppExit Default Restart
%NSSM% set WishTicket AppRestartDelay 5000

REM --- Servizio Caddy (HTTPS) ---
%NSSM% status WishTicketCaddy >nul 2>&1 || %NSSM% install WishTicketCaddy "%BASE%\bin\caddy.exe"
%NSSM% set WishTicketCaddy AppParameters run --config "%BASE%\Caddyfile"
%NSSM% set WishTicketCaddy AppDirectory "%BASE%"
%NSSM% set WishTicketCaddy DisplayName "Wish Ticket (Caddy HTTPS)"
%NSSM% set WishTicketCaddy Start SERVICE_AUTO_START
%NSSM% set WishTicketCaddy AppStdout "%BASE%\logs\caddy-servizio.log"
%NSSM% set WishTicketCaddy AppStderr "%BASE%\logs\caddy-servizio.log"
%NSSM% set WishTicketCaddy AppExit Default Restart

REM --- Firewall: aperte 80 e 443, la 8040 resta solo locale ---
netsh advfirewall firewall show rule name="Wish Ticket HTTP" >nul 2>&1 || netsh advfirewall firewall add rule name="Wish Ticket HTTP" dir=in action=allow protocol=TCP localport=80
netsh advfirewall firewall show rule name="Wish Ticket HTTPS" >nul 2>&1 || netsh advfirewall firewall add rule name="Wish Ticket HTTPS" dir=in action=allow protocol=TCP localport=443

%NSSM% restart WishTicket
%NSSM% restart WishTicketCaddy
echo.
echo Servizi installati e avviati.
endlocal
