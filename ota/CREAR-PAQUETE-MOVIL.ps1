param(
  [Parameter(Mandatory=$true)][string]$Version,
  [Parameter(Mandatory=$true)][string]$AppAsar,
  [string]$Notes = 'Actualización TPV Gelateria',
  [string]$OutputDir = ''
)
$ErrorActionPreference='Stop'
$v=($Version-replace '^[vV]','').Trim()
if($v-notmatch '^\d+\.\d+\.\d+$'){throw 'Versión no válida. Usa, por ejemplo, 4.0.1'}
$asar=(Resolve-Path -LiteralPath $AppAsar).Path
if(-not $OutputDir){$OutputDir=Split-Path -Parent $asar}
New-Item -ItemType Directory -Force -Path $OutputDir|Out-Null
$bytes=[IO.File]::ReadAllBytes($asar)
$sha=[BitConverter]::ToString(([Security.Cryptography.SHA256]::Create()).ComputeHash($bytes)).Replace('-','').ToLowerInvariant()
$payload=[ordered]@{schema=1;appId='com.lagelateria.tpv';version=$v;notes=$Notes;sha256=$sha;size=$bytes.Length;publishedAt=(Get-Date).ToUniversalTime().ToString('o');appAsarBase64=[Convert]::ToBase64String($bytes)}
$out=Join-Path $OutputDir "TPV-Gelateria-v$v.flamaupdate"
$payload|ConvertTo-Json -Depth 6 -Compress|Set-Content -LiteralPath $out -Encoding UTF8
Write-Host "Paquete móvil creado: $out" -ForegroundColor Green
Write-Host "SHA-256: $sha"
