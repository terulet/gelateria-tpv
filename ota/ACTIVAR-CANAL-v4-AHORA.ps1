$ErrorActionPreference='Stop'
$root=Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$publisher=Join-Path $PSScriptRoot 'PUBLICAR-GITHUB-RELEASE.ps1'
$asar=Join-Path $root 'app.asar'
& $publisher -Version '4.0.0' -AppAsar $asar -Notes 'TPV FINAL v3 + FLAMA Update v1: actualizaciones remotas, backup, SHA-256, prueba de arranque y rollback automático.' -Repository 'terulet/TPV-Gelateria-Updates' -CreatePublicRepository
