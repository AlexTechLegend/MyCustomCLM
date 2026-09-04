#Requires -RunAsAdministrator
$ErrorActionPreference = 'Stop'
$nssm = Get-Command nssm -ErrorAction SilentlyContinue
$winsw = Join-Path $PSScriptRoot 'vigil-service.exe'
if ($nssm) {
  & $nssm.Source stop VigilCLM
  & $nssm.Source remove VigilCLM confirm
  Write-Host 'Removed VigilCLM (NSSM).'
  return
}
if (Test-Path $winsw) {
  & $winsw stop
  & $winsw uninstall
  Write-Host 'Removed Vigil CLM (WinSW).'
  return
}
throw 'Neither NSSM nor deploy\windows\vigil-service.exe was found.'
