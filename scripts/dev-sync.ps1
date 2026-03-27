Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

Write-Host "Pulling latest changes from GitLab..."
& git pull --ff-only
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

Write-Host "Starting local dev server..."
& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "dev-local.ps1")
exit $LASTEXITCODE
