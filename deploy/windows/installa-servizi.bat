@echo off
REM ============================================================
REM  Wish Ticket - installazione dei servizi Windows con NSSM
REM  Da eseguire UNA volta, come Amministratore.
REM  Prerequisiti: Node 24 LTS, nssm.exe e caddy.exe in C:\wish-ticket\bin
REM ============================================================
setlocal
set BASE=C:\wish-ticket
set APP=%BASE%\app
set NSSM=%BASE%\bin\nssm.exe
set NODE="C:\Program Files\nodejs\node.exe"

if not exist "%BASE%\logs" mkdir "%BASE%\logs"

REM --- Servizio Node (app web + API) ---
%NSSM% install WishTicket %NODE% "--env-file=%APP%\.env" "%APP%\apps\api\dist\server.js"
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
%NSSM% install WishTicketCaddy "%BASE%\bin\caddy.exe" run --config "%APP%\deploy\windows\Caddyfile"
%NSSM% set WishTicketCaddy AppDirectory "%BASE%"
%NSSM% set WishTicketCaddy DisplayName "Wish Ticket (Caddy HTTPS)"
%NSSM% set WishTicketCaddy Start SERVICE_AUTO_START
%NSSM% set WishTicketCaddy AppExit Default Restart

REM --- Firewall: aperte 80 e 443, la 8040 resta solo locale ---
netsh advfirewall firewall add rule name="Wish Ticket HTTP" dir=in action=allow protocol=TCP localport=80
netsh advfirewall firewall add rule name="Wish Ticket HTTPS" dir=in action=allow protocol=TCP localport=443

%NSSM% start WishTicket
%NSSM% start WishTicketCaddy
echo.
echo Servizi installati e avviati.
endlocal
