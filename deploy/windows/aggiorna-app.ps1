# Wish Ticket - aggiornamento automatico da GitHub
# Eseguito dall'Utilita di pianificazione ogni 5 minuti (vedi deploy/windows/ISTRUZIONI-AGGIORNAMENTO.md).
#
# Se su GitHub (branch main) c'e una versione nuova:
#   1. scarica le modifiche
#   2. reinstalla i pacchetti, solo se sono cambiati
#   3. compila l'app
#   4. riavvia il servizio WishTicket e controlla che risponda
# Se la compilazione o il riavvio falliscono, torna alla versione precedente e lo scrive nel registro.
# La copia sul server non va modificata a mano: viene sempre allineata a GitHub.
# .env, data\ (allegati), node_modules e dist non sono su GitHub e non vengono toccati.

$Repo  = 'C:\Users\Administrator\Documents\Git\wish-ticket'
$Base  = 'C:\wish-ticket'
$Log   = "$Base\logs\aggiornamenti.log"
$Lock  = "$Base\aggiornamento.lock"
$Scartata = "$Base\versione-scartata.txt"   # versione che non si e riusciti a installare: non si riprova
$Git   = 'C:\Program Files\Git\cmd\git.exe'
$Node  = 'C:\nvm4w\nodejs'
$Npm   = "$Node\npm.cmd"
$Nssm  = "$Base\bin\nssm.exe"
$Salute = 'http://127.0.0.1:8040/api/salute'

$env:Path = "$Node;$env:Path"
if (-not (Test-Path "$Base\logs")) { New-Item -ItemType Directory -Path "$Base\logs" | Out-Null }

function Scrivi($testo) {
    Add-Content -Path $Log -Value ("{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $testo)
}

# Esegue un comando npm nella cartella del progetto; in caso di errore scrive le ultime righe nel registro.
function Esegui-Npm([string[]]$argomenti) {
    Push-Location $Repo
    try {
        $out = & $Npm @argomenti 2>&1 | Out-String
        if ($LASTEXITCODE -ne 0) {
            $coda = ($out -split "`r?`n" | Where-Object { $_.Trim() } | Select-Object -Last 15) -join "`n    "
            Scrivi ("ERRORE npm " + ($argomenti -join ' ') + ":`n    " + $coda)
            return $false
        }
        return $true
    } finally { Pop-Location }
}

function Risponde {
    for ($i = 0; $i -lt 20; $i++) {
        Start-Sleep -Seconds 3
        try {
            $r = Invoke-WebRequest -Uri $Salute -UseBasicParsing -TimeoutSec 5
            if ($r.StatusCode -eq 200) { return $true }
        } catch { }
    }
    return $false
}

function Riavvia {
    & $Nssm restart WishTicket 2>&1 | Out-Null
    return (Risponde)
}

# Un solo aggiornamento alla volta (un blocco rimasto da piu di 30 minuti si considera abbandonato)
if ((Test-Path $Lock) -and ((Get-Item $Lock).LastWriteTime -gt (Get-Date).AddMinutes(-30))) { exit 0 }
Set-Content -Path $Lock -Value $PID

try {
    & $Git -C $Repo fetch --quiet origin main 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { Scrivi 'ERRORE: impossibile contattare GitHub (fetch fallito)'; exit 1 }

    $prima  = (& $Git -C $Repo rev-parse HEAD).Trim()
    $remoto = (& $Git -C $Repo rev-parse origin/main).Trim()
    if ($prima -eq $remoto) { exit 0 }
    if ((Test-Path $Scartata) -and ((Get-Content $Scartata -Raw).Trim() -eq $remoto)) { exit 0 }

    & $Git -C $Repo reset --hard --quiet origin/main
    if ($LASTEXITCODE -ne 0) { Scrivi 'ERRORE: aggiornamento dei file non riuscito'; exit 1 }
    $msg = (& $Git -C $Repo log -1 --format='%h %s').Trim()
    Scrivi "Nuova versione: $msg"

    $pacchetti = & $Git -C $Repo diff --name-only $prima HEAD -- package-lock.json
    $ok = $true
    if ($pacchetti -or -not (Test-Path "$Repo\node_modules")) { $ok = Esegui-Npm -argomenti 'ci','--no-audit','--no-fund' }
    if ($ok) { $ok = Esegui-Npm -argomenti 'run','build' }
    if ($ok) { $ok = Riavvia }

    if ($ok) {
        Remove-Item -Path $Scartata -ErrorAction SilentlyContinue
        Scrivi 'Aggiornamento completato, app online'
        exit 0
    }

    # Qualcosa e andato storto: si torna alla versione di prima
    Set-Content -Path $Scartata -Value $remoto
    Scrivi "Ripristino della versione precedente ($($prima.Substring(0,7))); la versione $($remoto.Substring(0,7)) non verra riprovata"
    & $Git -C $Repo reset --hard --quiet $prima
    if ($pacchetti) { Esegui-Npm -argomenti 'ci','--no-audit','--no-fund' | Out-Null }
    if ((Esegui-Npm -argomenti 'run','build') -and (Riavvia)) {
        Scrivi 'Versione precedente ripristinata, app online'
    } else {
        Scrivi 'ATTENZIONE: anche il ripristino non e riuscito, serve un controllo manuale'
    }
    exit 1
} catch {
    Scrivi ('ERRORE: ' + $_.Exception.Message)
    exit 1
} finally {
    Remove-Item -Path $Lock -ErrorAction SilentlyContinue
}
