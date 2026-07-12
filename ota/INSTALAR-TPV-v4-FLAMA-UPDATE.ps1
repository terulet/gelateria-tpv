$ErrorActionPreference = 'Stop'
$PackageRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ExpectedVersion = '4.0.0'
$AppId = 'com.lagelateria.tpv'
$AppName = 'TPV Gelateria'
$DefaultManifest = 'https://github.com/terulet/TPV-Gelateria-Updates/releases/latest/download/manifest.json'
$LogFile = Join-Path $PackageRoot 'INSTALACION-v4.log'

function Log([string]$Text) {
  $line = "$(Get-Date -Format o) $Text"
  Add-Content -LiteralPath $LogFile -Value $line -Encoding UTF8
  Write-Host $Text
}
function Read-Json([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return $null }
  try { return (Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json) } catch { return $null }
}
function Write-Json([string]$Path, $Value) {
  $Value | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $Path -Encoding UTF8
}
function Stop-TPV([string]$ExePath) {
  Get-Process -ErrorAction SilentlyContinue | ForEach-Object {
    try {
      if (($_.Path -and [string]::Equals($_.Path,$ExePath,[StringComparison]::OrdinalIgnoreCase)) -or $_.ProcessName -eq 'POS Gelateria') {
        Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
      }
    } catch {}
  }
  Start-Sleep -Seconds 2
}
function Find-Install {
  $candidates = @(
    (Join-Path $env:ProgramFiles 'POS Gelateria'),
    (Join-Path ${env:ProgramFiles(x86)} 'POS Gelateria'),
    (Join-Path $env:LOCALAPPDATA 'Programs\POS Gelateria')
  ) | Where-Object { $_ -and (Test-Path -LiteralPath (Join-Path $_ 'resources\app.asar')) }
  if ($candidates.Count -eq 0) { throw 'No se encuentra la instalación de POS Gelateria.' }
  return $candidates[0]
}
function Find-Exe([string]$Install) {
  $preferred = Join-Path $Install 'POS Gelateria.exe'
  if (Test-Path -LiteralPath $preferred) { return $preferred }
  $exe = Get-ChildItem -LiteralPath $Install -Filter '*.exe' -File | Where-Object { $_.Name -notmatch 'unins|update|squirrel' } | Select-Object -First 1
  if ($null -eq $exe) { throw 'No se encuentra el ejecutable de POS Gelateria.' }
  return $exe.FullName
}
function Test-Health([string]$Version,[int]$Seconds=75) {
  $limit=(Get-Date).AddSeconds($Seconds)
  do {
    Start-Sleep -Seconds 2
    try {
      $r=Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:3001/api/health' -TimeoutSec 4
      if($r.StatusCode -eq 200){$j=$r.Content|ConvertFrom-Json;if($j.ok -eq $true -and [string]$j.version -eq $Version){return $true}}
    } catch {}
  } while((Get-Date)-lt $limit)
  return $false
}

try {
  Log '=== INICIO INSTALACIÓN TPV v4 + FLAMA UPDATE ==='
  $sourceAsar = Join-Path $PackageRoot 'app.asar'
  $hashFile = Join-Path $PackageRoot 'SHA256-app.asar.txt'
  $agentSource = Join-Path $PackageRoot 'AGENTE-FLAMA\FLAMA-Update-Agent.ps1'
  $sourceV3 = Join-Path $PackageRoot 'BASE-v3\app.asar'
  $hashV3File = Join-Path $PackageRoot 'BASE-v3\SHA256-app.asar.txt'
  if (-not (Test-Path -LiteralPath $sourceAsar)) { throw 'Falta app.asar en el paquete.' }
  if (-not (Test-Path -LiteralPath $agentSource)) { throw 'Falta FLAMA-Update-Agent.ps1.' }
  if (-not (Test-Path -LiteralPath $sourceV3)) { throw 'Falta la base FINAL v3 de recuperación.' }
  if (-not (Test-Path -LiteralPath $hashV3File)) { throw 'Falta el SHA-256 de la base FINAL v3.' }
  if (-not (Test-Path -LiteralPath $hashFile)) { throw 'Falta SHA256-app.asar.txt.' }
  $expectedHash = ((Get-Content -LiteralPath $hashFile -Raw) -split '\s+')[0].Trim().ToLowerInvariant()
  $actualHash = (Get-FileHash -LiteralPath $sourceAsar -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($expectedHash -ne $actualHash) { throw 'El app.asar del paquete no coincide con su SHA-256.' }
  $expectedV3Hash = ((Get-Content -LiteralPath $hashV3File -Raw) -split '\s+')[0].Trim().ToLowerInvariant()
  $actualV3Hash = (Get-FileHash -LiteralPath $sourceV3 -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($expectedV3Hash -ne $actualV3Hash) { throw 'La base FINAL v3 no coincide con su SHA-256.' }
  Log "Paquete v4 verificado: $actualHash"
  Log "Base v3 verificada: $actualV3Hash"

  $install = Find-Install
  $resources = Join-Path $install 'resources'
  $destinationAsar = Join-Path $resources 'app.asar'
  $exePath = Find-Exe $install
  $dataDir = Join-Path $env:APPDATA 'POS Gelateria'
  $updateRoot = Join-Path $env:LOCALAPPDATA 'FLAMA Update\TPV Gelateria'
  $agentTarget = Join-Path $updateRoot 'FLAMA-Update-Agent.ps1'
  $backupsRoot = Join-Path $updateRoot 'backups'
  $stagingRoot = Join-Path $updateRoot 'staging'
  $configPath = Join-Path $updateRoot 'config.json'
  Log "Instalación encontrada: $install"
  Log "Datos protegidos: $dataDir"

  Stop-TPV $exePath

  # Copia humana de la versión que estaba realmente instalada antes de v4.
  $desktopBackup = Join-Path ([Environment]::GetFolderPath('Desktop')) 'BACKUP-TPV-VERSION-PREVIA-A-v4'
  New-Item -ItemType Directory -Force -Path $desktopBackup | Out-Null
  Copy-Item -LiteralPath $destinationAsar -Destination (Join-Path $desktopBackup 'app.asar.pre-v4.backup') -Force
  if (Test-Path -LiteralPath $dataDir) {
    $desktopData = Join-Path $desktopBackup 'datos-pre-v4'
    if (Test-Path -LiteralPath $desktopData) { Remove-Item -LiteralPath $desktopData -Recurse -Force }
    Copy-Item -LiteralPath $dataDir -Destination $desktopData -Recurse -Force
  }
  "Backup previo a FLAMA v4`r`nFecha: $(Get-Date -Format o)`r`nVersión: la que estaba instalada antes de v4`r`n" | Set-Content -LiteralPath (Join-Path $desktopBackup 'BACKUP_OK.txt') -Encoding UTF8
  Log "Backup de emergencia creado: $desktopBackup"

  # Estructura persistente del agente. No vive dentro de app.asar.
  New-Item -ItemType Directory -Force -Path $updateRoot,$backupsRoot,$stagingRoot | Out-Null
  Copy-Item -LiteralPath $agentSource -Destination $agentTarget -Force

  # Sembrar la BASE FINAL v3 exacta dentro del historial FLAMA. Así el botón
  # rollback funciona incluso antes de recibir la primera actualización OTA.
  $seed = Join-Path $backupsRoot ('seed-v3-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
  New-Item -ItemType Directory -Force -Path $seed | Out-Null
  Copy-Item -LiteralPath $sourceV3 -Destination (Join-Path $seed 'app.asar') -Force
  if (Test-Path -LiteralPath $dataDir) { Copy-Item -LiteralPath $dataDir -Destination (Join-Path $seed 'datos') -Recurse -Force }
  [ordered]@{appId=$AppId;version='3.0.0';createdAt=(Get-Date).ToUniversalTime().ToString('o');destinationAsar=$destinationAsar;dataDir=$dataDir;legacy=$true} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $seed 'backup.json') -Encoding UTF8

  # Conservar configuración del canal si se reinstala v4.
  $old = Read-Json $configPath
  $manifest = if ($old -and $old.manifestUrl) { [string]$old.manifestUrl } else { $DefaultManifest }
  $notify = if ($old -and $old.notificationWebhookUrl) { [string]$old.notificationWebhookUrl } else { '' }
  $config = [ordered]@{
    schema=1; appId=$AppId; appName=$AppName; installedVersion=$ExpectedVersion;
    manifestUrl=$manifest; autoCheck=$true; autoDownload=$true;
    autoInstallWhenClosed=$true; autoInstallAtCashClose=$true; checkEveryMinutes=15;
    notificationWebhookUrl=$notify; agentVersion='1.0.0';
    installDir=$install; resourcesDir=$resources; destinationAsar=$destinationAsar;
    executablePath=$exePath; dataDir=$dataDir; userProfile=$env:USERPROFILE;
    installedAt=(Get-Date).ToUniversalTime().ToString('o')
  }
  Write-Json $configPath $config

  # El TPV y el agente se ejecutan con este mismo usuario. Se concede permiso
  # únicamente al usuario actual para sustituir el software sin futuros UAC/USB.
  $identity = "$env:USERDOMAIN\$env:USERNAME"
  & icacls.exe $resources /grant "${identity}:(OI)(CI)M" /C | Out-Null
  & icacls.exe $updateRoot /grant "${identity}:(OI)(CI)M" /T /C | Out-Null
  Log "Permisos OTA preparados para $identity"

  Copy-Item -LiteralPath $destinationAsar -Destination (Join-Path $resources 'app.asar.ultimo_backup') -Force
  Copy-Item -LiteralPath $sourceAsar -Destination (Join-Path $resources 'app.asar.flama-new') -Force
  if ((Get-FileHash -LiteralPath (Join-Path $resources 'app.asar.flama-new') -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedHash) { throw 'La copia temporal de v4 no coincide con el SHA-256.' }
  Copy-Item -LiteralPath (Join-Path $resources 'app.asar.flama-new') -Destination $destinationAsar -Force
  Remove-Item -LiteralPath (Join-Path $resources 'app.asar.flama-new') -Force
  if ((Get-FileHash -LiteralPath $destinationAsar -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedHash) { throw 'La v4 instalada no coincide con el SHA-256.' }
  Log 'app.asar v4 instalado correctamente.'

  # Comprobación cada 15 minutos, también cuando el TPV está cerrado.
  $taskName = 'FLAMA Update - TPV Gelateria'
  $powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$agentTarget`" -Mode Check"
  $action = New-ScheduledTaskAction -Execute $powershell -Argument $arguments
  $triggerLogon = New-ScheduledTaskTrigger -AtLogOn -User $identity
  $triggerRepeat = New-ScheduledTaskTrigger -Once -At ((Get-Date).AddMinutes(2)) -RepetitionInterval (New-TimeSpan -Minutes 15) -RepetitionDuration (New-TimeSpan -Days 3650)
  $principal = New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger @($triggerLogon,$triggerRepeat) -Principal $principal -Settings $settings -Force | Out-Null
  Log 'Tarea automática FLAMA creada (cada 15 minutos y al iniciar sesión).'

  Start-Process -FilePath $exePath | Out-Null
  if (-not (Test-Health $ExpectedVersion 75)) { throw 'La v4 no ha superado la prueba real de arranque y base de datos.' }
  Log 'Prueba de arranque, versión y base de datos: CORRECTA.'

  [ordered]@{schema=1;appId=$AppId;ok=$true;action='initial-install';version=$ExpectedVersion;message='TPV v4 + FLAMA Update instalado y verificado';finishedAt=(Get-Date).ToUniversalTime().ToString('o')} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $updateRoot 'last-result.json') -Encoding UTF8

  Write-Host ''
  Write-Host '============================================================' -ForegroundColor Green
  Write-Host ' TPV v4 + FLAMA UPDATE INSTALADO Y VERIFICADO' -ForegroundColor Green
  Write-Host '============================================================' -ForegroundColor Green
  Write-Host ''
  Write-Host 'El TPV ya puede recibir actualizaciones sin USB.'
  Write-Host 'Panel móvil: misma IP Tailscale de métricas + /update.html'
  Write-Host ''
  exit 0
} catch {
  $msg=$_.Exception.Message
  Log "ERROR: $msg"
  try {
    if ($exePath) { Stop-TPV $exePath }
    if ($desktopBackup -and (Test-Path -LiteralPath (Join-Path $desktopBackup 'app.asar.pre-v4.backup')) -and $destinationAsar) {
      Copy-Item -LiteralPath (Join-Path $desktopBackup 'app.asar.pre-v4.backup') -Destination $destinationAsar -Force
      if ($exePath) { Start-Process -FilePath $exePath | Out-Null }
      Log 'Se ha restaurado automáticamente la versión previa a v4.'
    }
  } catch { Log "No se pudo completar la restauración automática: $($_.Exception.Message)" }
  Write-Host ''
  Write-Host 'ERROR EN LA INSTALACIÓN:' -ForegroundColor Red
  Write-Host $msg -ForegroundColor Red
  Write-Host 'La versión previa a v4 se ha intentado restaurar automáticamente.' -ForegroundColor Yellow
  exit 1
}
