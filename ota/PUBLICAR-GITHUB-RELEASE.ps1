param(
  [Parameter(Mandatory=$true)][string]$Version,
  [Parameter(Mandatory=$true)][string]$AppAsar,
  [string]$Notes = 'Actualización TPV Gelateria',
  [string]$Repository = 'terulet/TPV-Gelateria-Updates',
  [switch]$CreatePublicRepository
)
$ErrorActionPreference='Stop'
$v=($Version-replace '^[vV]','').Trim()
if($v-notmatch '^\d+\.\d+\.\d+$'){throw 'Versión no válida. Usa, por ejemplo, 4.0.1'}
if(-not(Get-Command gh -ErrorAction SilentlyContinue)){throw 'Falta GitHub CLI (gh). Claude Code puede instalarlo o ejecutarlo en el equipo de desarrollo.'}
& gh auth status *> $null
if($LASTEXITCODE -ne 0){throw 'GitHub CLI no tiene una sesión iniciada. Ejecuta gh auth login.'}
if($CreatePublicRepository){
  & gh repo view $Repository *> $null
  if($LASTEXITCODE -ne 0){& gh repo create $Repository --public --description 'Canal OTA de TPV Gelateria - solo software, nunca datos' --disable-issues --disable-wiki; if($LASTEXITCODE -ne 0){throw 'No se pudo crear el repositorio de actualizaciones'}}
}
& gh repo view $Repository *> $null
if($LASTEXITCODE -ne 0){throw "No existe o no es accesible el repositorio $Repository"}
$asar=(Resolve-Path -LiteralPath $AppAsar).Path
$temp=Join-Path $env:TEMP "flama-release-$v-$PID"
New-Item -ItemType Directory -Force -Path $temp|Out-Null
try{
  $asset=Join-Path $temp 'tpv-app.asar';Copy-Item -LiteralPath $asar -Destination $asset -Force
  $hash=(Get-FileHash -LiteralPath $asset -Algorithm SHA256).Hash.ToLowerInvariant();$size=(Get-Item -LiteralPath $asset).Length
  $url="https://github.com/$Repository/releases/download/v$v/tpv-app.asar"
  $manifest=[ordered]@{schema=1;appId='com.lagelateria.tpv';version=$v;url=$url;sha256=$hash;size=$size;notes=$Notes;publishedAt=(Get-Date).ToUniversalTime().ToString('o');mandatory=$false}
  $manifestPath=Join-Path $temp 'manifest.json';$manifest|ConvertTo-Json -Depth 6|Set-Content -LiteralPath $manifestPath -Encoding UTF8
  & gh release view "v$v" --repo $Repository *> $null
  if($LASTEXITCODE -eq 0){throw "Ya existe la release v$v. Usa una versión superior."}
  & gh release create "v$v" $asset $manifestPath --repo $Repository --title "TPV Gelateria v$v" --notes $Notes --latest
  if($LASTEXITCODE -ne 0){throw 'GitHub no pudo publicar la release'}
  Write-Host "Release v$v publicada y lista para FLAMA Update." -ForegroundColor Green
  Write-Host "Manifest: https://github.com/$Repository/releases/latest/download/manifest.json"
  Write-Host "SHA-256: $hash"
}finally{Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue}
