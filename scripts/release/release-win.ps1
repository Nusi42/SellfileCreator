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

  # Ask upfront — before any slow steps — so the user isn't blocked mid-run.
  $runTests = $true
  if (-not $DevBuild) {
    $userAnswered = $false
    try {
      for ($i = 5; $i -gt 0; $i--) {
        Write-Host -NoNewline "`r  Run test suite? [Y/n]  Defaulting to Y in $i second(s)... "
        $sliceStart = [DateTime]::Now
        while (([DateTime]::Now - $sliceStart).TotalMilliseconds -lt 1000) {
          if ([Console]::KeyAvailable) {
            $key = [Console]::ReadKey($true)
            Write-Host ''
            if ($key.KeyChar -eq 'n' -or $key.KeyChar -eq 'N') {
              $runTests = $false
            }
            $userAnswered = $true
            break
          }
          Start-Sleep -Milliseconds 100
        }
        if ($userAnswered) { break }
      }
      if (-not $userAnswered) { Write-Host '' }
    } catch {
      Write-Host ''
      Write-Warning "Could not read console input (non-interactive session?); defaulting to run tests."
    }
  }

  # Sync node_modules to the committed lockfile so the release is built from
  # exactly what's in version control. Skipped for -DevBuild to preserve fast
  # iteration; dev builds use whatever the developer has installed locally.
  if (-not $DevBuild) {
    Write-Host 'Syncing dependencies to lockfile (npm ci)...'
    npm ci --silent
    if ($LASTEXITCODE -ne 0) {
      throw "npm ci failed with exit code $LASTEXITCODE"
    }
  }

  # Refresh third-party notices so the release archive carries accurate attributions.
  Write-Host 'Refreshing third-party notices...'
  npm run --silent generate:third-party-notices
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to update third-party notices (exit code $LASTEXITCODE)"
  }

  # Fail fast on type errors before the expensive build/e2e phases. This runs the
  # main project AND the scripts project (tsconfig.scripts.json), the latter being
  # what `export:l10n` compiles at line ~175 — catching a scripts-tsconfig break here
  # (seconds) instead of after a full build (minutes). Covers dev builds too.
  Write-Host 'Type-checking (npm run typecheck)...'
  npm run --silent typecheck
  if ($LASTEXITCODE -ne 0) {
    throw "Typecheck failed with exit code $LASTEXITCODE"
  }

  # Run unit (+ e2e tests for production releases; skip for dev builds to keep iteration fast.
  # don't error out if e2e tests fail
  if (-not $DevBuild) {
    if ($runTests) {
      Write-Host 'Running test suite (npm run test:unit)...'
      npm run --silent test:unit
      if ($LASTEXITCODE -ne 0) {
        throw "Tests failed with exit code $LASTEXITCODE"
      }
      # Full e2e tier for releases: both viewports (1280 + FHD) and full iteration counts
      # (E2E_FULL via --full). The default `test:e2e` is the lean dev loop; releases must
      # exercise the complete matrix + leak/fragmentation audits.
      Write-Host 'Running test suite (npm run test:e2e:full)...'
      npm run --silent test:e2e:full
    } else {
      Write-Host 'Skipping test suite.' -ForegroundColor Yellow
    }
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
  $builtIndex = Join-Path $RepoRoot 'dist.app\index.html'
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

  # Table-driven preset staging. Each row describes one shipped preset:
  #   SourceFile  — filename inside presets/ that holds the base SFC
  #   StagedFile  — destination filename inside staging/Sellfiles/
  #   HsfVariants — recipe-overrides DSL tokens to materialize alongside; an
  #                 empty array means "ship just the SFC, no derived HSF"
  # Adding a new preset = one extra row; the loop below handles patching and
  # HSF generation uniformly. A sibling patch file at
  # presets/<basename>.patch.json (e.g. lategame.patch.json) is applied
  # automatically — see presets/PATCHES.md for the schema.
  $presets = @(
    @{
      SourceFile  = 'lategame.sfc'
      StagedFile  = 'Midgame_Lategame_Endgame_Sample.sfc'
      HsfVariants = @(
        @{ Token = 'midgame';  OutputName = 'midgame-sellfile.hsf' },
        @{ Token = 'lategame'; OutputName = 'lategame-sellfile.hsf' },
        @{ Token = 'endgame';  OutputName = 'endgame-sellfile.hsf' }
      )
    },
    @{
      SourceFile  = 'beginner.sfc'
      StagedFile  = 'Beginner_Sample.sfc'
      HsfVariants = @()
    }
  )

  # Shared paths and tool resolutions used by every row.
  $presetsDir = Join-Path $RepoRoot 'presets'
  $sellfilesDir = Join-Path $staging 'Sellfiles'
  if (-not (Test-Path $sellfilesDir)) { New-Item -ItemType Directory -Path $sellfilesDir | Out-Null }
  $patchScript = Join-Path $RepoRoot 'scripts\tooling\apply-preset-patch.mjs'
  $genScript = Join-Path $RepoRoot 'scripts\tooling\gen-release-hsf.mjs'

  foreach ($preset in $presets) {
    $sourcePath = Join-Path $presetsDir $preset.SourceFile
    if (-not (Test-Path -LiteralPath $sourcePath)) {
      throw "Preset not found: $sourcePath"
    }
    # The staged file is the post-patch (or verbatim) baseline. Every HSF
    # variant for this row reads from it, so they all see the same edits.
    $stagedPath = Join-Path $sellfilesDir $preset.StagedFile
    $basename = [System.IO.Path]::GetFileNameWithoutExtension($preset.SourceFile)
    $patchPath = Join-Path $presetsDir ("{0}.patch.json" -f $basename)
    if (Test-Path -LiteralPath $patchPath) {
      Write-Host ("Applying preset patch: {0}" -f (Split-Path -Leaf $patchPath))
      node --experimental-wasm-modules $patchScript $sourcePath $patchPath $stagedPath
      if ($LASTEXITCODE -ne 0) { throw "Preset patch application failed for $($preset.SourceFile) (exit code $LASTEXITCODE)" }
    } else {
      # No patch declared — ship the source verbatim under its staged name.
      Copy-Item -LiteralPath $sourcePath -Destination $stagedPath -Force
    }
    # Generate any declared HSF variants against the staged SFC.
    if ($preset.HsfVariants.Count -gt 0) {
      Write-Host ("Generating preset sellfiles from {0}..." -f $preset.SourceFile)
      foreach ($variant in $preset.HsfVariants) {
        Write-Host ("  Generating {0} ({1})..." -f $variant.OutputName, $variant.Token)
        node --experimental-wasm-modules $genScript $stagedPath $variant.Token (Join-Path $sellfilesDir $variant.OutputName)
        if ($LASTEXITCODE -ne 0) { throw "Sellfile generation failed for '$($variant.Token)' (exit code $LASTEXITCODE)" }
      }
    }
  }

  # Stage the WebSocket DB watchers under dev/ for helper integrations.
  $devDir = Join-Path $staging 'dev'
  if (-not (Test-Path $devDir)) { New-Item -ItemType Directory -Path $devDir | Out-Null }

  $watcherScripts = @(
    'run-db-watcher.ps1'
  )
  foreach ($scriptName in $watcherScripts) {
    # Pull watcher scripts from the dedicated scripts/watchers folder.
    $scriptSrc = Join-Path $RepoRoot "scripts\\watchers\\$scriptName"
    if (Test-Path $scriptSrc) {
      Copy-Item -LiteralPath $scriptSrc -Destination (Join-Path $devDir $scriptName) -Force
    }
  }

  $protocolDocs = @(
    'docs\\technical\\websocket-jsonrpc.md'
  )
  foreach ($docPath in $protocolDocs) {
    $docSrc = Join-Path $RepoRoot $docPath
    if (Test-Path $docSrc) {
      $docName = Split-Path -Leaf $docSrc
      Copy-Item -LiteralPath $docSrc -Destination (Join-Path $devDir $docName) -Force
    }
  }

  # Keep the helper BAT in the watcher bundle.
  $watcherBatSrc = Join-Path $RepoRoot 'scripts\watchers\Stream-Helper-DB-to-Creator.bat'
  if (Test-Path $watcherBatSrc) {
    $watcherBatOut = Join-Path $devDir 'Stream-Helper-DB-to-Creator.bat'
    $watcherBatRaw = Get-Content -Raw -LiteralPath $watcherBatSrc
    # Rewrite the fixed app entry for packaged builds so runtime probing is unnecessary.
    $prodEntryLine = 'set "APP_ENTRY_PATH=!SCRIPT_DIR!..\SellfileCreator.html"'
    $watcherBatPatched = [regex]::Replace(
      $watcherBatRaw,
      '(?im)^set "APP_ENTRY_PATH=.*"$',
      $prodEntryLine
    )
    if ($watcherBatPatched -eq $watcherBatRaw) {
      throw "Expected APP_ENTRY_PATH line not found in $watcherBatSrc"
    }
    Write-TextUtf8NoBom -Path $watcherBatOut -Text $watcherBatPatched
  }

  # Legacy HTTP sample payloads are no longer staged.

  # Ship the custom gearsets example under dev/ (keeps root uncluttered).
  $customGearsetsSrc = Join-Path $RepoRoot 'examples\custom.gearsets.json'
  if (-not (Test-Path -LiteralPath $customGearsetsSrc)) {
    throw "Expected example not found: $customGearsetsSrc"
  }
  Copy-Item -LiteralPath $customGearsetsSrc -Destination (Join-Path $devDir 'custom.gearsets.json') -Force


  # Stage localization JSON templates for contributors
  $l10nDist = Join-Path $RepoRoot 'dist.app\l10n'
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

  # Generate CRC.txt — one line per staged file: relative-path<TAB>CRC32 (hex, 8 uppercase digits).
  # Uses an inline C# CRC32 helper (standard IEEE 802.3 polynomial) — no external dependencies.
  Write-Host 'Generating CRC.txt...'
  Add-Type -TypeDefinition @'
using System;
public static class Crc32Helper {
    static readonly uint[] Table;
    static Crc32Helper() {
        Table = new uint[256];
        for (uint i = 0; i < 256; i++) {
            uint c = i;
            for (int j = 0; j < 8; j++)
                c = (c & 1) == 1 ? (0xEDB88320u ^ (c >> 1)) : (c >> 1);
            Table[i] = c;
        }
    }
    public static uint Compute(byte[] data) {
        uint crc = 0xFFFFFFFF;
        foreach (byte b in data)
            crc = Table[(crc ^ b) & 0xFF] ^ (crc >> 8);
        return crc ^ 0xFFFFFFFF;
    }
}
'@
  $crcLines = [System.Collections.Generic.List[string]]::new()
  Get-ChildItem -LiteralPath $staging -Recurse -File | Sort-Object FullName | ForEach-Object {
    $relativePath = $_.FullName.Substring($staging.Length).TrimStart('\', '/')
    $bytes = [System.IO.File]::ReadAllBytes($_.FullName)
    $crcHex = '{0:X8}' -f [Crc32Helper]::Compute($bytes)
    $crcLines.Add("$relativePath`t$crcHex")
  }
  $crcText = $crcLines -join "`n"
  Write-TextUtf8NoBom -Path (Join-Path $staging 'CRC.txt') -Text $crcText

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
    $builtIndex = Join-Path $RepoRoot 'dist.app\index.html'
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
