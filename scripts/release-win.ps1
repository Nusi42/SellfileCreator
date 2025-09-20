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

  # Run HSFR end-to-end tests before building the release. Abort on failures.
  Write-Host 'Running HSFR tests (npm run test:hsfr)...'
  npm run --silent test:hsfr
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

  # Validate build output
  $builtIndex = Join-Path $RepoRoot 'dist\index.html'
  if (-not (Test-Path $builtIndex)) { throw "Build output not found: $builtIndex" }

  # Stage files with requested names (no subdirectories in archive)
  Copy-Item -LiteralPath $builtIndex -Destination (Join-Path $staging 'SellfileCreator.html') -Force
  # Inject version into README title when staging README.txt
  $readmeSrc = Join-Path $RepoRoot 'README.md'
  $readmeDst = Join-Path $staging 'README.txt'
  $readmeRaw = Get-Content -Raw -LiteralPath $readmeSrc
  if ($readmeRaw.Length -gt 0 -and $readmeRaw[0] -eq [char]0xFEFF) { $readmeRaw = $readmeRaw.Substring(1) }
  $readmeLines = $readmeRaw -split "\r?\n"
  if ($readmeLines.Length -gt 0 -and $readmeLines[0].StartsWith('# RSL Helper Sellfile Creator')) {
    $badge = "###### v$releaseVersion"
    if ($readmeLines.Length -gt 1 -and $readmeLines[1].StartsWith('###### v')) {
      $readmeLines[1] = $badge
    } else {
      $readmeLines = @($readmeLines[0], $badge) + $readmeLines[1..($readmeLines.Length-1)]
    }
  }
  $readmeOut = [string]::Join("`n", $readmeLines)
  Write-TextUtf8NoBom -Path $readmeDst -Text $readmeOut
  # Pick the most recent Nusi_* samples to include as examples.
  # Why: Ship current, user-relevant examples without hardcoding old filenames.
  $samplesDir = Join-Path $RepoRoot 'samples'
  $latestHsfr = Get-ChildItem -LiteralPath $samplesDir -Filter 'Nusi_*.hsfr' -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  $latestHsf  = Get-ChildItem -LiteralPath $samplesDir -Filter 'Nusi_*.hsf'  -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $latestHsfr) { throw "No Nusi_*.hsfr found in 'samples'" }
  if (-not $latestHsf)  { throw "No Nusi_*.hsf found in 'samples'" }
  Write-Host ("Using samples: {0} and {1}" -f $latestHsfr.Name, $latestHsf.Name)
  Copy-Item -LiteralPath $latestHsfr.FullName -Destination (Join-Path $staging 'Example.hsfr') -Force
  Copy-Item -LiteralPath $latestHsf.FullName  -Destination (Join-Path $staging 'Example.hsf')  -Force

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
    Compress-Archive -Path @('SellfileCreator.html','README.txt','Example.hsfr','Example.hsf','runme.bat') `
      -DestinationPath $archivePath -CompressionLevel Optimal -Force
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
