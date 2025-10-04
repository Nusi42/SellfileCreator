<#
  Build-and-package script for Windows.
  - Builds the app via Vite.
  - Stages artifacts with required names (no subdirs in archive).
  - Creates a versioned zip archive using native Windows tooling.

  Why: Ensures a reproducible, Windows-friendly release bundle matching the
  requested file names and archive naming format without depending on dev envs.
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'


# Helper: write text as UTF-8 without BOM (works in both Windows PowerShell and PowerShell 7+).
function Write-TextUtf8NoBom([string]$Path, [string]$Text) {
  $enc = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Text, $enc)
}

# Helper: write text as UTF-8 with BOM (required for release README files).
function Write-TextUtf8WithBom([string]$Path, [string]$Text) {
  $enc = New-Object System.Text.UTF8Encoding($true)
  [System.IO.File]::WriteAllText($Path, $Text, $enc)
}

# Helper: convert README markdown to a flat UTF-8 text file with injected version badge.
function Convert-ReadmeToTxt([string]$SourcePath, [string]$DestinationPath, [string]$VersionLabel) {
  if (-not (Test-Path -LiteralPath $SourcePath)) { return }
  $raw = Get-Content -Raw -LiteralPath $SourcePath
  if ($raw.Length -gt 0 -and $raw[0] -eq [char]0xFEFF) { $raw = $raw.Substring(1) }
  $lines = $raw -split "\r?\n"
  if ($lines.Length -gt 0 -and $lines[0].StartsWith('# RSL Helper Sellfile Creator')) {
    $badge = "###### v$VersionLabel"
    if ($lines.Length -gt 1 -and $lines[1].StartsWith('###### v')) {
      $lines[1] = $badge
    } elseif ($lines.Length -gt 1) {
      $lines = @($lines[0], $badge) + $lines[1..($lines.Length - 1)]
    } else {
      $lines = @($lines[0], $badge)
    }
  }
  $out = [string]::Join("`n", $lines)
  Write-TextUtf8WithBom -Path $DestinationPath -Text $out
}

# Resolve repo root (this script lives in ./scripts)
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Resolve-Path (Join-Path $ScriptDir '..')
Push-Location $RepoRoot
try {
  # Using built-in Compress-Archive; no external dependencies.

  # Read version from package.json and normalize for release
  $pkgPath = Join-Path $RepoRoot 'package.json'
  $pkgRaw = Get-Content -Raw -LiteralPath $pkgPath
  if ($pkgRaw.Length -gt 0 -and $pkgRaw[0] -eq [char]0xFEFF) { $pkgRaw = $pkgRaw.Substring(1) }
  $pkg = $pkgRaw | ConvertFrom-Json
  $origVersion = [string]$pkg.version
  if (-not $origVersion) { throw 'Unable to read version from package.json' }
  # Clean version (strip any pre-release like -dev)
  $releaseVersion = ($origVersion -split '-', 2)[0]
  $versionWasCleaned = $false
  if ($releaseVersion -ne $origVersion) {
    Write-Host "Cleaning version: $origVersion -> $releaseVersion"
    $pkg.version = $releaseVersion
    $json = $pkg | ConvertTo-Json -Depth 20
    Write-TextUtf8NoBom -Path $pkgPath -Text $json
    $versionWasCleaned = $true
  }
  $archiveName = "SellfileCreator_v$releaseVersion.zip"
  $archivePath = Join-Path $RepoRoot $archiveName

  # Run HSFC end-to-end tests before building the release. Abort on failures.
  Write-Host 'Running HSFC tests (npm run test:hsfc)...'
  npm run --silent test:hsfc
  if ($LASTEXITCODE -ne 0) {
    throw "Tests failed with exit code $LASTEXITCODE"
  }



  # Ensure clean staging directory
  $staging = Join-Path $RepoRoot 'release_staging'
  if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
  New-Item -ItemType Directory -Path $staging | Out-Null

  # Build, stage, archive — on failure, restore original version.
  try {
  # Build production assets
  Write-Host 'Building app (vite build)...'
  npm run --silent build
  if ($LASTEXITCODE -ne 0) {
    throw "Build failed with exit code $LASTEXITCODE"
  }

  # Export localization catalogs after build (vite build cleans dist)
  Write-Host 'Exporting localization catalogs (npm run export:l10n)...'
  npm run --silent export:l10n
  if ($LASTEXITCODE -ne 0) {
    throw "Catalog export failed with exit code $LASTEXITCODE"
  }

  # Validate build output
  $builtIndex = Join-Path $RepoRoot 'dist\index.html'
  if (-not (Test-Path $builtIndex)) { throw "Build output not found: $builtIndex" }

  # Stage files with requested names (no subdirectories in archive)
  Copy-Item -LiteralPath $builtIndex -Destination (Join-Path $staging 'SellfileCreator.html') -Force

  # Stage README files (English + localized variants) with version badge
  $versionLabel = $releaseVersion
  $readmeSrc = Join-Path $RepoRoot 'README.md'
  Convert-ReadmeToTxt -SourcePath $readmeSrc -DestinationPath (Join-Path $staging 'README.txt') -VersionLabel $versionLabel
  $localizedReadmes = Get-ChildItem -LiteralPath $RepoRoot -Filter 'README.*.md' -File | Where-Object { $_.Name -ne 'README.md' }
  foreach ($file in $localizedReadmes) {
    $destName = "{0}.txt" -f $file.BaseName
    Convert-ReadmeToTxt -SourcePath $file.FullName -DestinationPath (Join-Path $staging $destName) -VersionLabel $versionLabel
  }

  # Pick the most recent Nusi_* samples to include as examples.
  # Why: Ship current, user-relevant examples without hardcoding old filenames.
  $samplesDir = Join-Path $RepoRoot 'samples'
  $latestHsfc = Get-ChildItem -LiteralPath $samplesDir -Filter 'Nusi_*.hsfc' -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  $latestHsf  = Get-ChildItem -LiteralPath $samplesDir -Filter 'Nusi_*.hsf'  -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $latestHsfc) { throw "No Nusi_*.hsfc found in 'samples'" }
  if (-not $latestHsf)  { throw "No Nusi_*.hsf found in 'samples'" }
  Write-Host ("Using samples: {0} and {1}" -f $latestHsfc.Name, $latestHsf.Name)
  Copy-Item -LiteralPath $latestHsfc.FullName -Destination (Join-Path $staging 'Example.hsfc') -Force
  Copy-Item -LiteralPath $latestHsf.FullName  -Destination (Join-Path $staging 'Example.hsf')  -Force

  # Stage the sample push server + payload examples under dev/
  $devDir = Join-Path $staging 'dev'
  if (-not (Test-Path $devDir)) { New-Item -ItemType Directory -Path $devDir | Out-Null }

  $sampleServerSrc = Join-Path $RepoRoot 'scripts\run-sample-server.ps1'
  if (Test-Path $sampleServerSrc) {
    Copy-Item -LiteralPath $sampleServerSrc -Destination (Join-Path $devDir 'run-sample-server.ps1') -Force
  }

  $protocolSrc = Join-Path $RepoRoot 'scripts\push-protocol'
  if (Test-Path $protocolSrc) {
    $protocolDest = Join-Path $devDir 'push-protocol'
    if (-not (Test-Path $protocolDest)) { New-Item -ItemType Directory -Path $protocolDest | Out-Null }
    Get-ChildItem -LiteralPath $protocolSrc -File | ForEach-Object {
      Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $protocolDest $_.Name) -Force
    }
  }

  $mockExportSource = Join-Path $RepoRoot 'scripts\mock-export.hsf'
  if (Test-Path $mockExportSource) {
    Copy-Item -LiteralPath $mockExportSource -Destination (Join-Path $devDir 'mock-export.hsf') -Force
  }

  # Stage localization JSON templates for contributors
  $l10nDist = Join-Path $RepoRoot 'dist\l10n'
  if (Test-Path $l10nDist) {
    $i18nDir = Join-Path $staging 'i18n'
    if (-not (Test-Path $i18nDir)) { New-Item -ItemType Directory -Path $i18nDir | Out-Null }
    Get-ChildItem -LiteralPath $l10nDist -Filter '*.l10n.json' -File | ForEach-Object {
      Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $i18nDir $_.Name) -Force
    }
  }

  # Create a helper batch to open the HTML in default browser when double-clicked.
  $runBatPath = Join-Path $staging 'runme.bat'
  $runBat = @'
@echo off
setlocal
REM Open the HTML in the default browser
start "" "%~dp0SellfileCreator.html"
exit /b
'@
  Set-Content -LiteralPath $runBatPath -Value $runBat -Encoding ASCII

  # Create archive in repo root. Use staging as cwd so entries have no subdir paths.
  Write-Host "Creating archive: $archivePath"
  Push-Location $staging
  try {
    # Create ZIP containing only flat entries (no subdirectories)
    if (Test-Path $archivePath) { Remove-Item -LiteralPath $archivePath -Force }
    # Include all staged files (flat)
    Compress-Archive -Path (Get-ChildItem -Name) -DestinationPath $archivePath -CompressionLevel Optimal -Force
  } finally {
    Pop-Location
  }

    Write-Host "Release package created: $archivePath" -ForegroundColor Green
  } catch {
    Write-Warning $_
    Write-Host "Restoring original package.json version ($origVersion) due to failure" -ForegroundColor Yellow
    Write-TextUtf8NoBom -Path $pkgPath -Text $pkgRaw
    throw
  }

  # Also persist the built HTML to old_releases for quick access/auditing.
  try {
    $oldReleases = Join-Path $RepoRoot 'old_releases'
    if (-not (Test-Path $oldReleases)) { New-Item -ItemType Directory -Path $oldReleases | Out-Null }
    $builtIndex = Join-Path $RepoRoot 'dist\index.html'
    $versionedHtml = Join-Path $oldReleases ("SellfileCreator_v{0}.html" -f $releaseVersion)
    Copy-Item -LiteralPath $builtIndex -Destination $versionedHtml -Force
  } catch {
    Write-Warning "Failed to copy built HTML to old_releases: $_"
  }

  # After packaging: bump patch and add -dev suffix (e.g., 1.2.3 -> 1.2.4-dev)
  if ($releaseVersion -match '^(\d+)\.(\d+)\.(\d+)$') {
    $maj = [int]$Matches[1]
    $min = [int]$Matches[2]
    $pat = [int]$Matches[3]
    $next = "{0}.{1}.{2}-dev" -f $maj, $min, ($pat + 1)
    Write-Host "Setting next development version: $next"
    $pkg.version = $next
    $json2 = $pkg | ConvertTo-Json -Depth 20
    Write-TextUtf8NoBom -Path $pkgPath -Text $json2
  } else {
    Write-Warning "Release version '$releaseVersion' is not x.y.z; skipping dev bump"
  }
} finally {
  # Clean up staging folder to avoid clutter
  if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
  Pop-Location
}
