# Lokalni build in ponovni zagon (app_instructions.md, "Lokalni build za testiranje").
# Ustavi SAMO "vite preview" tega projekta (preveri pot v ukazni vrstici procesa), zgradi in zažene na novo.
# Strežnikov drugih projektov (glej tabelo portov v app_instructions.md) se ne dotakne.
#
# Uporaba (iz mape projekta):  npm run lokalno            -> port 3004 (fiksni port kp, tabela v app_instructions.md)
#                         npm run lokalno -- 3005    -> drug port

param([int]$Port = 3004)

$ErrorActionPreference = "Stop"
$web = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path  # mapa aplikacije

# 1) Ustavi obstoječi vite preview tega projekta (na kateremkoli portu)
$nasi = Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
    Where-Object { $_.CommandLine -and $_.CommandLine -like "*$web*" -and $_.CommandLine -match 'vite(\.js)?"?\s+preview' }
foreach ($p in $nasi) {
    Write-Output "Ustavljam vite preview tega projekta (PID $($p.ProcessId))"
    Stop-Process -Id $p.ProcessId -Force
}

# 2) Port mora biti prost (zaseden z drugim projektom -> ne ustavljamo, javimo)
Start-Sleep -Milliseconds 500
$zaseden = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($zaseden) {
    $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId=$($zaseden[0].OwningProcess)").CommandLine
    Write-Output "Port $Port je zaseden z drugim procesom: $cmd"
    Write-Output "Poženi z drugim portom: npm run lokalno -- $($Port + 1)"
    exit 1
}

# 3) Build
Set-Location $web
npm run build
if ($LASTEXITCODE -ne 0) { Write-Output "BUILD NI USPEL"; exit $LASTEXITCODE }

# 4) Zagon v ozadju (izpis v $env:TEMP)
$log = Join-Path $env:TEMP "kp-lokalno-$Port.log"
Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "npx vite preview --host 0.0.0.0 --port $Port --strictPort > `"$log`" 2>&1" `
    -WorkingDirectory $web -WindowStyle Hidden

# 5) Počakaj, da strežnik odgovori
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
        Write-Output "Build uspel, strežnik teče: http://localhost:$Port (izpis: $log)"
        exit 0
    }
}
Write-Output "Strežnik se ni zagnal v 30 s - glej $log"
exit 1
