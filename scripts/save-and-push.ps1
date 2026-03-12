param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$Message
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

& git add .
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

$pending = & git diff --cached --name-only
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

if (-not $pending) {
  Write-Host "No changes to commit."
  exit 0
}

& git commit -m $Message
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

$branch = (& git rev-parse --abbrev-ref HEAD).Trim()
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

& git push origin $branch
exit $LASTEXITCODE
