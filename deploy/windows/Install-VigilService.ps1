#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Install Vigil as a Windows service (NSSM or WinSW).

.DESCRIPTION
  Prefer NSSM when `nssm` is on PATH. Otherwise look for WinSW as
  vigil-service.exe next to this script (download WinSW x64 and rename it).

  Run from an elevated PowerShell after `npm run build`.
#>
param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path,
  [string]$DataDir = '',
  [string]$NodeExe = 'node'
)

$ErrorActionPreference = 'Stop'
if (-not $DataDir) { $DataDir = Join-Path $RepoRoot 'data' }
$dist = Join-Path $RepoRoot 'server\dist\index.js'
if (-not (Test-Path $dist)) {
  throw "Build the server first: npm run build -w server  (missing $dist)"
}

$env:VIGIL_AUTH = '1'
$env:VIGIL_DATA_DIR = $DataDir
$env:NODE_ENV = 'production'

$nssm = Get-Command nssm -ErrorAction SilentlyContinue
$winsw = Join-Path $PSScriptRoot 'vigil-service.exe'

if ($nssm) {
  Write-Host "Installing via NSSM ($($nssm.Source))"
  & $nssm.Source install VigilCLM $NodeExe $dist
  & $nssm.Source set VigilCLM AppDirectory $RepoRoot
  & $nssm.Source set VigilCLM AppEnvironmentExtra "VIGIL_AUTH=1" "VIGIL_DATA_DIR=$DataDir" 'NODE_ENV=production' 'PORT=4180'
  & $nssm.Source set VigilCLM Start SERVICE_AUTO_START
  & $nssm.Source set VigilCLM AppStdout (Join-Path $DataDir 'vigil-service.log')
  & $nssm.Source set VigilCLM AppStderr (Join-Path $DataDir 'vigil-service.err.log')
  & $nssm.Source start VigilCLM
  Write-Host 'Service VigilCLM installed and started.'
  return
}

if (Test-Path $winsw) {
  $xml = Join-Path $PSScriptRoot 'vigil-winsw.xml'
  Copy-Item $xml (Join-Path $PSScriptRoot 'vigil-service.xml') -Force
  & $winsw install
  & $winsw start
  Write-Host 'WinSW service installed and started.'
  return
}

Write-Host @'
No service wrapper found. Install one of:
  winget install NSSM.NSSM
  or download WinSW (https://github.com/winsw/winsw/releases), save the x64
  exe as deploy\windows\vigil-service.exe, and re-run this script.

Service account: use a dedicated local account (or gMSA), grant
"Log on as a service", Modify on the data directory, and Read+Execute
on the OpenSSL binary. Do not run as Domain Admin.
'@
exit 1
