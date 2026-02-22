<#
  Build-and-package script for Windows.
  - Builds the app via Vite.
  - Stages artifacts with required names (root + dev/ subtree in archive).
  - Creates a versioned zip archive using native Windows tooling.

  Why: Ensures a reproducible, Windows-friendly release bundle matching the
  requested file names and archive naming format without depending on dev envs.
#>

param(
  [switch]$DevBuild
)

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

# Resolve repo root (this script lives in ./scripts/release).
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
# Use a single ChildPath to avoid Windows PowerShell Join-Path positional arg issues.
$RepoRoot = Resolve-Path (Join-Path -Path $ScriptDir -ChildPath '..\..')
Push-Location $RepoRoot
$staging = $null
try {
  # Using built-in Compress-Archive; no external dependencies.

  # Single source of truth: keep shipped sample names consistent.
  $ShippedSellfileBaseName = 'lategame'
  $ShippedRecipeFileName = '_RECIPE_FOR_LATEGAME_AND_ENDGAME_.sfr'

  # Read version from package.json and normalize depending on mode
  $pkgPath = Join-Path $RepoRoot 'package.json'
  $pkgRaw = Get-Content -Raw -LiteralPath $pkgPath
  if ($pkgRaw.Length -gt 0 -and $pkgRaw[0] -eq [char]0xFEFF) { $pkgRaw = $pkgRaw.Substring(1) }
  $pkg = $pkgRaw | ConvertFrom-Json
  $origVersion = [string]$pkg.version
  if (-not $origVersion) { throw 'Unable to read version from package.json' }
  $releaseVersion = ($origVersion -split '-', 2)[0]
  $versionWasCleaned = $false
  if ($DevBuild) {
    $devSuffix = ''
    if (-not $origVersion.ToLower().EndsWith('-dev')) {
      $devSuffix = '-dev'
    }
    $packageLabel = "{0}{1}" -f $origVersion, $devSuffix
    $versionLabel = $origVersion
    $archiveName = "SellfileCreator_v$packageLabel.zip"
  } else {
    # Clean version (strip any pre-release like -dev)
    if ($releaseVersion -ne $origVersion) {
      Write-Host "Cleaning version: $origVersion -> $releaseVersion"
      $pkg.version = $releaseVersion
      $json = $pkg | ConvertTo-Json -Depth 20
      Write-TextUtf8NoBom -Path $pkgPath -Text $json
      $versionWasCleaned = $true
    }

    $packageLabel = $releaseVersion
    $versionLabel = $releaseVersion
    $archiveName = "SellfileCreator_v$packageLabel.zip"
  }
  $archivePath = Join-Path $RepoRoot $archiveName

  # Refresh third-party notices so the release archive carries accurate attributions.
  Write-Host 'Refreshing third-party notices...'
  npm run --silent generate:third-party-notices
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to update third-party notices (exit code $LASTEXITCODE)"
  }

  # Run the full automated test suite (all Playwright browsers) before building the release.
  # Write-Host 'Running test suite (npm run test:all:full)...'
  # npm run --silent test:all:full
  # if ($LASTEXITCODE -ne 0) {
  #   throw "Tests failed with exit code $LASTEXITCODE"
  # }



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
  $readmeSrc = Join-Path $RepoRoot 'README.md'
  Convert-ReadmeToTxt -SourcePath $readmeSrc -DestinationPath (Join-Path $staging 'README.txt') -VersionLabel $versionLabel
  $localizedReadmes = Get-ChildItem -LiteralPath $RepoRoot -Filter 'README.*.md' -File | Where-Object { $_.Name -ne 'README.md' }
  foreach ($file in $localizedReadmes) {
    $destName = "{0}.txt" -f $file.BaseName
    Convert-ReadmeToTxt -SourcePath $file.FullName -DestinationPath (Join-Path $staging $destName) -VersionLabel $versionLabel
  }

  # Include release history at the root of the archive
  $historySrc = Join-Path $RepoRoot 'docs\HISTORY.txt'
  if (-not (Test-Path -LiteralPath $historySrc)) { throw "Release history not found: $historySrc" }
  Copy-Item -LiteralPath $historySrc -Destination (Join-Path $staging 'HISTORY.txt') -Force

  # Include third-party notices to satisfy attribution requirements
  $noticesSrc = Join-Path $RepoRoot 'THIRD_PARTY_NOTICES.txt'
  if (-not (Test-Path -LiteralPath $noticesSrc)) { throw "Third-party notices file not found: $noticesSrc" }
  Copy-Item -LiteralPath $noticesSrc -Destination (Join-Path $staging 'THIRD_PARTY_NOTICES.txt') -Force

  # Pick the most recent Nusi_* examples to include as ship-ready references.
  # Why: Ship current, user-relevant examples without hardcoding old filenames.
  $samplesDir = Join-Path $RepoRoot 'examples'

  $sampleSfr = Get-ChildItem -LiteralPath $samplesDir -Filter 'Nusi_*.sfr' -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $sampleSfr) {
    $fallbackSfrPath = Join-Path $samplesDir 'example.sfr'
    if (Test-Path -LiteralPath $fallbackSfrPath) {
      $sampleSfr = Get-Item -LiteralPath $fallbackSfrPath
    } else {
      $fallbackSfrPath = Join-Path $samplesDir 'example.sfr'
      if (Test-Path -LiteralPath $fallbackSfrPath) {
        $sampleSfr = Get-Item -LiteralPath $fallbackSfrPath
      } else {
        throw "No Example recipe sample (.sfr/.hsfc) found in 'examples'"
      }
    }
  }

  # Pin the lategame/endgame HSF payloads so release archives are deterministic.
  # Why: These files are curated baselines and should not float to timestamped Nusi_* variants.
  $lategameHsfPath = Join-Path $samplesDir 'lategame.hsf'
  if (-not (Test-Path -LiteralPath $lategameHsfPath)) {
    $legacyLategameHsfPath = Join-Path $samplesDir 'Lategame.hsf'
    if (Test-Path -LiteralPath $legacyLategameHsfPath) {
      $lategameHsfPath = $legacyLategameHsfPath
    } else {
      throw "Lategame HSF sample not found in 'examples'"
    }
  }

  # Keep endgame alongside lategame in every release so users can choose either baseline.
  $endgameHsfPath = Join-Path $samplesDir 'endgame.hsf'
  if (-not (Test-Path -LiteralPath $endgameHsfPath)) {
    $legacyEndgameHsfPath = Join-Path $samplesDir 'Endgame.hsf'
    if (Test-Path -LiteralPath $legacyEndgameHsfPath) {
      $endgameHsfPath = $legacyEndgameHsfPath
    } else {
      throw "Endgame HSF sample not found in 'examples'"
    }
  }

  Write-Host ("Using samples: {0}, {1}, and {2}" -f $sampleSfr.Name, (Split-Path -Leaf $lategameHsfPath), (Split-Path -Leaf $endgameHsfPath))
  $sellfilesDir = Join-Path $staging 'Sellfiles'
  if (-not (Test-Path $sellfilesDir)) { New-Item -ItemType Directory -Path $sellfilesDir | Out-Null }
  Copy-Item -LiteralPath $sampleSfr.FullName -Destination (Join-Path $sellfilesDir $ShippedRecipeFileName) -Force
  Copy-Item -LiteralPath $lategameHsfPath -Destination (Join-Path $sellfilesDir "$ShippedSellfileBaseName-sellfile.hsf") -Force
  Copy-Item -LiteralPath $endgameHsfPath  -Destination (Join-Path $sellfilesDir 'endgame-sellfile.hsf') -Force
  # Ship the baseline Basic.sfr so newcomers can inspect an intentionally minimal recipe.
  $basicSfrPath = Join-Path $samplesDir 'Basic.sfr'
  if (-not (Test-Path -LiteralPath $basicSfrPath)) {
    $legacyBasicSfrPath = Join-Path $samplesDir 'Basic.sfr'
    if (Test-Path -LiteralPath $legacyBasicSfrPath) {
      $basicSfrPath = $legacyBasicSfrPath
    } else {
      throw "Basic recipe sample (.sfr/.hsfc) not found in 'examples'"
    }
  }
  Copy-Item -LiteralPath $basicSfrPath -Destination (Join-Path $sellfilesDir 'basic.sfr') -Force

  # Stage the WebSocket DB watchers under dev/ for helper integrations.
  $devDir = Join-Path $staging 'dev'
  if (-not (Test-Path $devDir)) { New-Item -ItemType Directory -Path $devDir | Out-Null }

  $sampleServerScripts = @(
    'run-db-watcher.ps1',
    'run-db-watcher-helper.ps1',
    'run-db-watcher-core.ps1'
  )
  foreach ($scriptName in $sampleServerScripts) {
    # Pull watcher scripts from the dedicated scripts/watchers folder.
    $scriptSrc = Join-Path $RepoRoot "scripts\\watchers\\$scriptName"
    if (Test-Path $scriptSrc) {
      Copy-Item -LiteralPath $scriptSrc -Destination (Join-Path $devDir $scriptName) -Force
    }
  }

  $protocolDocs = @(
    'docs\\technical\\websocket-jsonrpc.md',
    'docs\\technical\\websocket-helper.md'
  )
  foreach ($docPath in $protocolDocs) {
    $docSrc = Join-Path $RepoRoot $docPath
    if (Test-Path $docSrc) {
      $docName = Split-Path -Leaf $docSrc
      Copy-Item -LiteralPath $docSrc -Destination (Join-Path $devDir $docName) -Force
    }
  }

  # Keep the helper BAT in the watcher bundle.
  $sampleServerBatSrc = Join-Path $RepoRoot 'scripts\watchers\Stream-Helper-DB-to-Creator.bat'
  if (Test-Path $sampleServerBatSrc) {
    $sampleServerBatOut = Join-Path $devDir 'Stream-Helper-DB-to-Creator.bat'
    $sampleServerBatRaw = Get-Content -Raw -LiteralPath $sampleServerBatSrc
    # Rewrite the fixed app entry for packaged builds so runtime probing is unnecessary.
    $prodEntryLine = 'set "APP_ENTRY_PATH=!SCRIPT_DIR!..\SellfileCreator.html"'
    $sampleServerBatPatched = [regex]::Replace(
      $sampleServerBatRaw,
      '(?im)^set "APP_ENTRY_PATH=.*"$',
      $prodEntryLine
    )
    if ($sampleServerBatPatched -eq $sampleServerBatRaw) {
      throw "Expected APP_ENTRY_PATH line not found in $sampleServerBatSrc"
    }
    Write-TextUtf8NoBom -Path $sampleServerBatOut -Text $sampleServerBatPatched
  }

  # Legacy HTTP sample payloads are no longer staged.

  # Ship the custom gearsets example under dev/ (keeps root uncluttered).
  $customGearsetsSrc = Join-Path $RepoRoot 'examples\custom.gearsets.json'
  if (-not (Test-Path -LiteralPath $customGearsetsSrc)) {
    throw "Expected example not found: $customGearsetsSrc"
  }
  Copy-Item -LiteralPath $customGearsetsSrc -Destination (Join-Path $devDir 'custom.gearsets.json') -Force


  # Stage localization JSON templates for contributors
  $l10nDist = Join-Path $RepoRoot 'dist\l10n'
  if (Test-Path $l10nDist) {
    # Keep localization templates alongside other contributor-only artifacts.
    $i18nDir = Join-Path $devDir 'i18n'
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
    # Create ZIP containing staged content (including dev/ subtree).
    if (Test-Path $archivePath) { Remove-Item -LiteralPath $archivePath -Force }
    # Include all staged files (including any staged directories)
    Compress-Archive -Path (Get-ChildItem -Name) -DestinationPath $archivePath -CompressionLevel Optimal -Force
  } finally {
    Pop-Location
  }

    $modeLabel = if ($DevBuild) { 'Dev package created:' } else { 'Release package created:' }
    Write-Host "$modeLabel $archivePath" -ForegroundColor Green
  } catch {
    Write-Warning $_
    if (-not $DevBuild) {
      Write-Host "Restoring original package.json version ($origVersion) due to failure" -ForegroundColor Yellow
      Write-TextUtf8NoBom -Path $pkgPath -Text $pkgRaw
    }
    throw
  }

  # Also persist the built HTML to old_releases for quick access/auditing.
  try {
    $oldReleases = Join-Path $RepoRoot 'old_releases'
    if (-not (Test-Path $oldReleases)) { New-Item -ItemType Directory -Path $oldReleases | Out-Null }
    $builtIndex = Join-Path $RepoRoot 'dist\index.html'
    $htmlLabel = if ($DevBuild) { $packageLabel } else { $releaseVersion }
    $versionedHtml = Join-Path $oldReleases ("SellfileCreator_v{0}.html" -f $htmlLabel)
    Copy-Item -LiteralPath $builtIndex -Destination $versionedHtml -Force
  } catch {
    Write-Warning "Failed to copy built HTML to old_releases: $_"
  }

# After packaging: bump patch and add -dev suffix (e.g., 1.2.3 -> 1.2.4-dev)
  if (-not $DevBuild) {
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
  }
} finally {
  # Clean up staging folder to avoid clutter
  if ($staging -and (Test-Path $staging)) { Remove-Item $staging -Recurse -Force }
  Pop-Location
}
