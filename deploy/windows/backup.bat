@echo off
REM ============================================================
REM  Wish Ticket - backup notturno del database (14 giorni).
REM  Pianificarlo con: schtasks /create /tn "Wish Ticket backup"
REM    /tr "C:\wish-ticket\app\deploy\windows\backup.bat" /sc daily /st 02:30 /ru SYSTEM
REM  Richiede mongodump (MongoDB Database Tools) nel PATH.
REM ============================================================
setlocal
set BASE=C:\wish-ticket
set DEST=%BASE%\backup
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HHmm"') do set DATA=%%i
for /f "usebackq tokens=1,* delims==" %%a in ("%BASE%\app\.env") do if "%%a"=="MONGO_URI" set MONGO_URI=%%b

if not exist "%DEST%" mkdir "%DEST%"
mongodump --uri="%MONGO_URI%" --gzip --archive="%DEST%\wish_ticket_%DATA%.gz"
if errorlevel 1 (
  echo Backup NON riuscito >> "%BASE%\logs\backup.log"
  exit /b 1
)
REM Copia degli allegati (solo i file nuovi o cambiati)
if exist "%BASE%\app\data\allegati" robocopy "%BASE%\app\data\allegati" "%DEST%\allegati" /E /XO /NFL /NDL /NJH /NJS >nul
echo %DATA% backup ok >> "%BASE%\logs\backup.log"

REM Elimina i backup piu' vecchi di 14 giorni
forfiles /p "%DEST%" /m *.gz /d -14 /c "cmd /c del @path" 2>nul
endlocal
