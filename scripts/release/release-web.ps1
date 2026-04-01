<#
  Build script for a standard web-server deployment.
  - Builds the app via `vite build --mode web` → outputs split assets to dist.web/.
  - Exports localization catalogs into dist.web/l10n/.
  - The dist.web/ directory tree is the artifact; deploy it as-is to any web server.

  Why: The default `release:win` build inlines everything into one self-contained HTML
  file for file:// usage on Windows. This script produces a conventional web app build
  with separate, cacheable JS/CSS assets for hosting behind an HTTP server.
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Resolve repo root (this script lives in ./scripts/release).
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Resolve-Path (Join-Path -Path $ScriptDir -ChildPath '..\..')
Push-Location $RepoRoot

try {
  # Ensure the WASM rule-engine artifacts are up to date before building.
  # Separated from the vite step so PowerShell controls each exit code directly;
  # relying on `&&` chaining inside an npm script can lose PATH context on Windows.
  Write-Host 'Ensuring WASM build is up to date...'
  npm run --silent wasm:ensure:rule-engine
  if ($LASTEXITCODE -ne 0) {
    throw "WASM ensure failed with exit code $LASTEXITCODE"
  }

  # Build web assets (vite build --mode web → dist.web/).
  Write-Host 'Building web app (vite build --mode web)...'
  node ./node_modules/vite/bin/vite.js build --mode web
  if ($LASTEXITCODE -ne 0) {
    throw "Web build failed with exit code $LASTEXITCODE"
  }

  # Validate build output.
  $builtIndex = Join-Path $RepoRoot 'dist.web\index.html'
  if (-not (Test-Path $builtIndex)) { throw "Web build output not found: $builtIndex" }

  # Export localization catalogs into dist.web/l10n/ so the web server can serve them.
  # BUILD_TARGET=web tells export-catalogs.ts to write into dist.web/ instead of dist.app/.
  Write-Host 'Exporting localization catalogs (npm run export:l10n)...'
  $env:BUILD_TARGET = 'web'
  npm run --silent export:l10n
  if ($LASTEXITCODE -ne 0) {
    throw "Catalog export failed with exit code $LASTEXITCODE"
  }

  # Drop a PHP entry point that redirects to the SPA's index.html.
  $phpEntry = Join-Path $RepoRoot 'dist.web\index.php'
  Set-Content -Path $phpEntry -Value @'
<?php
header("Location: index.html");
exit;
?>
'@ -Encoding UTF8

  $distWeb = Join-Path $RepoRoot 'dist.web'
  Write-Host "Web build complete. Deploy the contents of:" -ForegroundColor Green
  Write-Host "  $distWeb" -ForegroundColor Green
} finally {
  # Clean up the env var so it does not leak into any subsequent npm calls in this shell.
  Remove-Item Env:\BUILD_TARGET -ErrorAction SilentlyContinue
  Pop-Location
}
