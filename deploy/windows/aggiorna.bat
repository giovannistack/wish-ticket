@echo off
REM ============================================================
REM  Wish Ticket - aggiornamento. Copiare la nuova versione in
REM  C:\wish-ticket\nuova e lanciare questo script come Amministratore.
REM  Il file .env resta quello di produzione.
REM ============================================================
setlocal
set BASE=C:\wish-ticket
set NSSM=%BASE%\bin\nssm.exe

if not exist "%BASE%\nuova\package.json" (
  echo Manca la nuova versione in %BASE%\nuova
  exit /b 1
)

pushd "%BASE%\nuova"
call npm ci || goto errore
call npm run build || goto errore
popd

%NSSM% stop WishTicket
if exist "%BASE%\precedente" rmdir /s /q "%BASE%\precedente"
move "%BASE%\app" "%BASE%\precedente" >nul
move "%BASE%\nuova" "%BASE%\app" >nul
copy /y "%BASE%\precedente\.env" "%BASE%\app\.env" >nul
REM Gli allegati restano: si spostano nella nuova versione
if exist "%BASE%\precedente\data" move "%BASE%\precedente\data" "%BASE%\app\data" >nul
%NSSM% start WishTicket
echo Aggiornamento completato. La versione precedente e' in %BASE%\precedente
exit /b 0

:errore
popd
echo Build non riuscita: il servizio NON e' stato toccato.
exit /b 1
