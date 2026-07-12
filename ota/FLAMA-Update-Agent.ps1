param(
  [ValidateSet('Check','Install','Rollback')]
  [string]$Mode = 'Check',
  [string]$RequestPath = ''
)

$ErrorActionPreference = 'Stop'
$AppId = 'com.lagelateria.tpv'
$AppName = 'TPV Gelateria'
$AgentVersion = '1.0.0'
$Root = Join-Path $env:LOCALAPPDATA 'FLAMA Update\TPV Gelateria'
$ConfigPath = Join-Path $Root 'config.json'
$StatePath = Join-Path $Root 'state.json'
$PendingPath = Join-Path $Root 'pending.json'
$RuntimePath = Join-Path $Root 'runtime-state.json'
$DefaultRequestPath = Join-Path $Root 'request.json'
$ResultPath = Join-Path $Root 'last-result.json'
$LogPath = Join-Path $Root 'flama-update-agent.log'
$StagingPath = Join-Path $Root 'staging'
$BackupsPath = Join-Path $Root 'backups'

New-Item -ItemType Directory -Force -Path $Root,$StagingPath,$BackupsPath | Out-Null

function Write-Log([string]$Message) {
  $line = "$(Get-Date -Format o) $Message"
  Add-Content -LiteralPath $LogPath -Value $line -Encoding UTF8
}

function Read-Json([string]$Path, $Fallback = $null) {
  if (-not (Test-Path -LiteralPath $Path)) { return $Fallback }
  try { return (Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json) }
  catch { Write-Log "JSON inválido en $Path : $($_.Exception.Message)"; return $Fallback }
}

function Write-JsonAtomic([string]$Path, $Value) {
  $tmp = "$Path.$PID.$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()).tmp"
  $Value | ConvertTo-Json -Depth 15 | Set-Content -LiteralPath $tmp -Encoding UTF8
  Move-Item -LiteralPath $tmp -Destination $Path -Force
}

function Get-Property($Object, [string]$Name, $Default = $null) {
  if ($null -ne $Object -and $Object.PSObject.Properties.Name -contains $Name) { return $Object.$Name }
  return $Default
}

function Normalize-Version([string]$Version) {
  $v = ($Version -replace '^[vV]','').Trim()
  if ($v -notmatch '^(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]+)?$') { throw "Versión no válida: $Version" }
  return "$([int]$Matches[1]).$([int]$Matches[2]).$([int]$Matches[3])"
}

function Compare-Version([string]$A, [string]$B) {
  $aa = (Normalize-Version $A).Split('.') | ForEach-Object { [int]$_ }
  $bb = (Normalize-Version $B).Split('.') | ForEach-Object { [int]$_ }
  for ($i=0; $i -lt 3; $i++) {
    if ($aa[$i] -gt $bb[$i]) { return 1 }
    if ($aa[$i] -lt $bb[$i]) { return -1 }
  }
  return 0
}

function Get-Sha256([string]$Path) {
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Save-State([hashtable]$Patch) {
  $current = Read-Json $StatePath ([pscustomobject]@{})
  $data = [ordered]@{}
  if ($null -ne $current) {
    foreach ($prop in $current.PSObject.Properties) { $data[$prop.Name] = $prop.Value }
  }
  foreach ($key in $Patch.Keys) { $data[$key] = $Patch[$key] }
  $data['schema'] = 1
  $data['appId'] = $AppId
  Write-JsonAtomic $StatePath $data
}

function Save-Result([bool]$Ok, [string]$Action, [string]$Version, [string]$Message, [string]$BackupPath = '') {
  $result = [ordered]@{
    schema = 1
    appId = $AppId
    ok = $Ok
    action = $Action
    version = $Version
    message = $Message
    backupPath = $BackupPath
    agentVersion = $AgentVersion
    finishedAt = (Get-Date).ToUniversalTime().ToString('o')
  }
  Write-JsonAtomic $ResultPath $result
  $phase = if ($Ok) { 'success' } else { 'error' }
  Save-State @{ phase=$phase; error=$(if($Ok){$null}else{$Message}); lastResultAt=$result.finishedAt; progress=$(if($Ok){100}else{0}) }
  Send-Notification $result
}

function Send-Notification($Payload) {
  try {
    $config = Read-Json $ConfigPath $null
    $url = [string](Get-Property $config 'notificationWebhookUrl' '')
    if ([string]::IsNullOrWhiteSpace($url)) { return }
    Invoke-RestMethod -Method Post -Uri $url -ContentType 'application/json' -Body ($Payload | ConvertTo-Json -Depth 8) -TimeoutSec 12 | Out-Null
  } catch { Write-Log "Webhook no enviado: $($_.Exception.Message)" }
}

function Get-AppProcesses($Config) {
  $exe = [string](Get-Property $Config 'executablePath' '')
  $list = @()
  foreach ($p in (Get-Process -ErrorAction SilentlyContinue)) {
    try {
      if ($exe -and $p.Path -and ([string]::Equals($p.Path, $exe, [StringComparison]::OrdinalIgnoreCase))) { $list += $p }
      elseif ($p.ProcessName -eq 'POS Gelateria') { $list += $p }
    } catch {}
  }
  return @($list | Sort-Object Id -Unique)
}

function Stop-App($Config) {
  $processes = Get-AppProcesses $Config
  foreach ($p in $processes) {
    try { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue } catch {}
  }
  $limit = (Get-Date).AddSeconds(15)
  do {
    Start-Sleep -Milliseconds 500
    $remaining = Get-AppProcesses $Config
  } while ($remaining.Count -gt 0 -and (Get-Date) -lt $limit)
  if ($remaining.Count -gt 0) { throw 'No se ha podido cerrar POS Gelateria para actualizar' }
}

function Start-App($Config) {
  $exe = [string](Get-Property $Config 'executablePath' '')
  if (-not $exe -or -not (Test-Path -LiteralPath $exe)) { throw "No se encuentra el ejecutable del TPV: $exe" }
  Start-Process -FilePath $exe | Out-Null
}

function Test-Health([string]$Url, [string]$ExpectedVersion, [int]$Seconds = 70) {
  $deadline = (Get-Date).AddSeconds($Seconds)
  $normalizedExpected = Normalize-Version $ExpectedVersion
  $legacy = ([int]($normalizedExpected.Split('.')[0])) -lt 4
  $legacyUrl = $Url -replace '/api/health$','/'
  do {
    Start-Sleep -Seconds 2
    try {
      $r = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 4
      if ($r.StatusCode -eq 200) {
        $body = $r.Content | ConvertFrom-Json
        if ($body.ok -eq $true -and (Normalize-Version ([string]$body.version)) -eq $normalizedExpected) { return $true }
      }
    } catch {}
    if ($legacy) {
      try {
        $legacyResponse = Invoke-WebRequest -UseBasicParsing -Uri $legacyUrl -TimeoutSec 4
        if ($legacyResponse.StatusCode -eq 200) { return $true }
      } catch {}
    }
  } while ((Get-Date) -lt $deadline)
  return $false
}

function Copy-DataBackup([string]$DataDir, [string]$Destination) {
  if (-not $DataDir -or -not (Test-Path -LiteralPath $DataDir)) { return }
  New-Item -ItemType Directory -Force -Path $Destination | Out-Null
  Copy-Item -LiteralPath (Join-Path $DataDir '*') -Destination $Destination -Recurse -Force -ErrorAction Stop
}

function Create-Backup($Config, [string]$CurrentVersion) {
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $folder = Join-Path $BackupsPath "$stamp-v$CurrentVersion"
  New-Item -ItemType Directory -Force -Path $folder | Out-Null
  $asar = [string](Get-Property $Config 'destinationAsar' '')
  if (-not (Test-Path -LiteralPath $asar)) { throw "No se encuentra app.asar instalado: $asar" }
  Copy-Item -LiteralPath $asar -Destination (Join-Path $folder 'app.asar') -Force
  $dataDir = [string](Get-Property $Config 'dataDir' '')
  if ($dataDir -and (Test-Path -LiteralPath $dataDir)) {
    Copy-Item -LiteralPath $dataDir -Destination (Join-Path $folder 'datos') -Recurse -Force
  }
  [ordered]@{
    appId=$AppId; version=$CurrentVersion; createdAt=(Get-Date).ToUniversalTime().ToString('o');
    destinationAsar=$asar; dataDir=$dataDir
  } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $folder 'backup.json') -Encoding UTF8
  return $folder
}

function Restore-Backup([string]$BackupFolder, $Config) {
  $backupAsar = Join-Path $BackupFolder 'app.asar'
  if (-not (Test-Path -LiteralPath $backupAsar)) { throw "Backup sin app.asar: $BackupFolder" }
  $dest = [string](Get-Property $Config 'destinationAsar' '')
  $destDir = Split-Path -Parent $dest
  New-Item -ItemType Directory -Force -Path $destDir | Out-Null
  Copy-Item -LiteralPath $backupAsar -Destination $dest -Force

  $backupData = Join-Path $BackupFolder 'datos'
  $dataDir = [string](Get-Property $Config 'dataDir' '')
  if ($dataDir -and (Test-Path -LiteralPath $backupData)) {
    if (Test-Path -LiteralPath $dataDir) { Remove-Item -LiteralPath $dataDir -Recurse -Force }
    Copy-Item -LiteralPath $backupData -Destination $dataDir -Recurse -Force
  }
}

function Cleanup-Backups {
  try {
    $all = @(Get-ChildItem -LiteralPath $BackupsPath -Directory | Sort-Object LastWriteTime -Descending)
    if ($all.Count -gt 10) { $all | Select-Object -Skip 10 | Remove-Item -Recurse -Force }
  } catch { Write-Log "No se pudieron limpiar backups: $($_.Exception.Message)" }
}

function Install-Update($Request, $Config) {
  $targetVersion = Normalize-Version ([string](Get-Property $Request 'targetVersion' ''))
  $currentVersion = Normalize-Version ([string](Get-Property $Request 'currentVersion' (Get-Property $Config 'installedVersion' '4.0.0')))
  $packagePath = [string](Get-Property $Request 'packagePath' '')
  $expectedHash = ([string](Get-Property $Request 'sha256' '')).ToLowerInvariant()
  $launchAfter = [bool](Get-Property $Request 'launchAfter' $true)
  $healthUrl = [string](Get-Property $Request 'healthUrl' 'http://127.0.0.1:3001/api/health')

  if (-not (Test-Path -LiteralPath $packagePath)) { throw "No se encuentra el paquete: $packagePath" }
  if ($expectedHash -notmatch '^[a-f0-9]{64}$') { throw 'SHA-256 del paquete no válido' }
  if ((Get-Sha256 $packagePath) -ne $expectedHash) { throw 'El paquete ha fallado la verificación SHA-256' }

  $wasRunning = (Get-AppProcesses $Config).Count -gt 0
  $backupFolder = ''
  Save-State @{ phase='installing'; availableVersion=$targetVersion; progress=100; error=$null }
  Write-Log "Instalando $currentVersion -> $targetVersion; wasRunning=$wasRunning"

  Start-Sleep -Seconds 3
  Stop-App $Config
  $backupFolder = Create-Backup $Config $currentVersion

  try {
    $dest = [string](Get-Property $Config 'destinationAsar' '')
    $newFile = "$dest.flama-new"
    Copy-Item -LiteralPath $packagePath -Destination $newFile -Force
    if ((Get-Sha256 $newFile) -ne $expectedHash) { throw 'La copia local de la actualización no coincide con el SHA-256' }
    Copy-Item -LiteralPath $newFile -Destination $dest -Force
    Remove-Item -LiteralPath $newFile -Force -ErrorAction SilentlyContinue
    if ((Get-Sha256 $dest) -ne $expectedHash) { throw 'El app.asar instalado no coincide con el SHA-256' }

    $Config.installedVersion = $targetVersion
    Write-JsonAtomic $ConfigPath $Config

    # Siempre se realiza un arranque de prueba. Si el TPV estaba cerrado, se
    # vuelve a cerrar tras verificarlo; así una actualización silenciosa no
    # deja una versión rota esperando al siguiente día.
    Start-App $Config
    if (-not (Test-Health $healthUrl $targetVersion 75)) { throw 'La nueva versión no superó la prueba de arranque y base de datos' }
    if (-not $launchAfter -and -not $wasRunning) { Stop-App $Config }

    if (Test-Path -LiteralPath $PendingPath) { Remove-Item -LiteralPath $PendingPath -Force }
    if (Test-Path -LiteralPath $DefaultRequestPath) { Remove-Item -LiteralPath $DefaultRequestPath -Force }
    Cleanup-Backups
    Save-Result $true 'install' $targetVersion "Actualización v$targetVersion instalada, verificada y operativa" $backupFolder
    Write-Log "Actualización $targetVersion correcta"
  } catch {
    $reason = $_.Exception.Message
    Write-Log "Fallo instalando $targetVersion: $reason. Iniciando rollback."
    try {
      Stop-App $Config
      if ($backupFolder) { Restore-Backup $backupFolder $Config }
      $Config.installedVersion = $currentVersion
      $Config.autoCheck = $false
      $Config.autoDownload = $false
      Write-JsonAtomic $ConfigPath $Config
      if ($launchAfter -or $wasRunning) { Start-App $Config }
      Save-Result $false 'install-rollback' $currentVersion "La actualización v$targetVersion falló, se restauró v$currentVersion y el canal quedó pausado: $reason" $backupFolder
    } catch {
      $rollbackError = $_.Exception.Message
      Save-Result $false 'critical' $currentVersion "Fallo de actualización y rollback: $reason / $rollbackError" $backupFolder
      throw "Fallo crítico: $reason / $rollbackError"
    }
  }
}

function Rollback-Latest($Request, $Config) {
  $backup = Get-ChildItem -LiteralPath $BackupsPath -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($null -eq $backup) { throw 'No existe ningún backup FLAMA para restaurar' }
  $meta = Read-Json (Join-Path $backup.FullName 'backup.json') $null
  $version = Normalize-Version ([string](Get-Property $meta 'version' '0.0.0'))
  Write-Log "Rollback manual hacia $version desde $($backup.FullName)"
  Start-Sleep -Seconds 3
  Stop-App $Config
  Restore-Backup $backup.FullName $Config
  $Config.installedVersion = $version
  $Config.autoCheck = $false
  $Config.autoDownload = $false
  Write-JsonAtomic $ConfigPath $Config
  Start-App $Config
  $healthUrl = [string](Get-Property $Request 'healthUrl' 'http://127.0.0.1:3001/api/health')
  if (-not (Test-Health $healthUrl $version 75)) { throw "El backup v$version se restauró, pero no superó la prueba de arranque" }
  Save-Result $true 'rollback' $version "Backup v$version restaurado correctamente" $backup.FullName
}

function Download-RemoteUpdate($Config) {
  $manifestUrl = [string](Get-Property $Config 'manifestUrl' '')
  if ([string]::IsNullOrWhiteSpace($manifestUrl)) { return $null }
  if ($manifestUrl -notmatch '^https://') { throw 'El canal de actualizaciones debe usar HTTPS' }
  Save-State @{ phase='checking'; progress=0; error=$null; lastCheckAt=(Get-Date).ToUniversalTime().ToString('o'); source='agent' }
  $manifestTemp = Join-Path $StagingPath 'manifest.tmp.json'
  Invoke-WebRequest -UseBasicParsing -Uri $manifestUrl -OutFile $manifestTemp -TimeoutSec 25 -Headers @{ 'User-Agent'="FLAMA-Update/$AgentVersion ($AppName)" }
  $manifest = Read-Json $manifestTemp $null
  Remove-Item -LiteralPath $manifestTemp -Force -ErrorAction SilentlyContinue
  if ($null -eq $manifest) { throw 'Manifest remoto no válido' }
  if ([string](Get-Property $manifest 'appId' '') -ne $AppId) { throw 'La actualización remota no pertenece a este TPV' }
  $version = Normalize-Version ([string](Get-Property $manifest 'version' ''))
  $current = Normalize-Version ([string](Get-Property $Config 'installedVersion' '4.0.0'))
  if ((Compare-Version $version $current) -le 0) {
    Save-State @{ phase='up-to-date'; availableVersion=$null; progress=100; error=$null; lastCheckAt=(Get-Date).ToUniversalTime().ToString('o') }
    return $null
  }
  $url = [string](Get-Property $manifest 'url' '')
  $hash = ([string](Get-Property $manifest 'sha256' '')).ToLowerInvariant()
  if (-not [bool](Get-Property $Config 'autoDownload' $true)) {
    Save-State @{ phase='available'; availableVersion=$version; progress=0; notes=[string](Get-Property $manifest 'notes' ''); error=$null; lastCheckAt=(Get-Date).ToUniversalTime().ToString('o'); source='agent' }
    return $null
  }
  if ($url -notmatch '^https://') { throw 'La descarga remota debe usar HTTPS' }
  if ($hash -notmatch '^[a-f0-9]{64}$') { throw 'SHA-256 remoto no válido' }
  $target = Join-Path $StagingPath "tpv-app-$version.asar"
  $needsDownload = $true
  if (Test-Path -LiteralPath $target) {
    try { if ((Get-Sha256 $target) -eq $hash) { $needsDownload = $false } } catch {}
  }
  if ($needsDownload) {
    Save-State @{ phase='downloading'; availableVersion=$version; progress=10; notes=[string](Get-Property $manifest 'notes' ''); error=$null }
    $part = "$target.part"
    Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $part -TimeoutSec 180 -Headers @{ 'User-Agent'="FLAMA-Update/$AgentVersion ($AppName)" }
    if ((Get-Sha256 $part) -ne $hash) { Remove-Item $part -Force; throw 'El paquete remoto ha fallado SHA-256' }
    Move-Item -LiteralPath $part -Destination $target -Force
  }
  $pending = [ordered]@{
    schema=1; appId=$AppId; version=$version; url=$url; sha256=$hash;
    size=(Get-Item -LiteralPath $target).Length; notes=[string](Get-Property $manifest 'notes' '');
    publishedAt=(Get-Property $manifest 'publishedAt' $null); mandatory=[bool](Get-Property $manifest 'mandatory' $false);
    packagePath=$target; stagedAt=(Get-Date).ToUniversalTime().ToString('o'); source='agent'
  }
  Write-JsonAtomic $PendingPath $pending
  Save-State @{ phase='ready'; availableVersion=$version; progress=100; notes=$pending.notes; error=$null; lastCheckAt=(Get-Date).ToUniversalTime().ToString('o'); source='agent' }
  return $pending
}

function Check-And-MaybeInstall {
  $config = Read-Json $ConfigPath $null
  if ($null -eq $config) { Write-Log 'Sin config.json; se omite comprobación'; return }
  if (-not [bool](Get-Property $config 'autoCheck' $true)) { Write-Log 'Canal pausado; se omite comprobación'; return }
  try {
    $pending = Download-RemoteUpdate $config
    if ($null -eq $pending) { return }
    $running = (Get-AppProcesses $config).Count -gt 0
    $autoClosed = [bool](Get-Property $config 'autoInstallWhenClosed' $true)
    $autoCash = [bool](Get-Property $config 'autoInstallAtCashClose' $true)
    $install = $false
    $launchAfter = $false
    if (-not $running -and $autoClosed) { $install=$true; $launchAfter=$false }
    elseif ($running -and $autoCash) {
      $runtime = Read-Json $RuntimePath $null
      if ($null -ne $runtime) {
        try {
          $age = [DateTime]::UtcNow - ([DateTime]::Parse([string]$runtime.timestamp).ToUniversalTime())
          if ($age.TotalSeconds -lt 75 -and [bool]$runtime.safeToRestart -and [bool]$runtime.cashClosed) { $install=$true; $launchAfter=$true }
        } catch {}
      }
    }
    if ($install) {
      $request = [pscustomobject]@{
        action='install'; appId=$AppId; currentVersion=[string](Get-Property $config 'installedVersion' '4.0.0');
        targetVersion=$pending.version; packagePath=$pending.packagePath; sha256=$pending.sha256;
        launchAfter=$launchAfter; healthUrl='http://127.0.0.1:3001/api/health'
      }
      Install-Update $request $config
    }
  } catch {
    $message = $_.Exception.Message
    Write-Log "Check fallido: $message"
    Save-State @{ phase='error'; error=$message; progress=0; lastCheckAt=(Get-Date).ToUniversalTime().ToString('o'); source='agent' }
  }
}

try {
  Write-Log "Inicio agente mode=$Mode request=$RequestPath"
  $config = Read-Json $ConfigPath $null
  if ($Mode -eq 'Check') {
    Check-And-MaybeInstall
  } elseif ($Mode -eq 'Install') {
    if ([string]::IsNullOrWhiteSpace($RequestPath)) { $RequestPath = $DefaultRequestPath }
    $request = Read-Json $RequestPath $null
    if ($null -eq $request) { throw "No se encuentra la solicitud de instalación: $RequestPath" }
    if ($null -eq $config) { throw 'No se encuentra config.json de FLAMA Update' }
    Install-Update $request $config
  } elseif ($Mode -eq 'Rollback') {
    if ([string]::IsNullOrWhiteSpace($RequestPath)) { $RequestPath = $DefaultRequestPath }
    $request = Read-Json $RequestPath ([pscustomobject]@{ healthUrl='http://127.0.0.1:3001/api/health' })
    if ($null -eq $config) { throw 'No se encuentra config.json de FLAMA Update' }
    Rollback-Latest $request $config
  }
} catch {
  $message = $_.Exception.Message
  Write-Log "ERROR FATAL mode=$Mode : $message"
  Save-Result $false $Mode ([string](Get-Property $config 'installedVersion' 'unknown')) $message ''
  exit 1
}
exit 0
