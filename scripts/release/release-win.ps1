<#
  Build-and-package script for Windows.
  - Builds the app via Vite.
  - Stages artifacts with required names (root + dev/ subtree in archive).
  - Creates a versioned zip archive using native Windows tooling.

  Why: Ensures a reproducible, Windows-friendly release bundle matching the
  requested file names and archive naming format without depending on dev envs.

  -Bump patch|minor|major picks which component the tree moves to AFTER this
  release ships (default patch). The run always PACKAGES the version already in
  package.json - the switch only chooses the number developed against next, so
  a feature release is `npm run release:win -- -Bump minor`, not a hand edit.
  Ignored with -DevBuild, which never bumps.

  A RELEASE IS TWO COMMITS, THEN A TAG ONCE PUBLISHED. The run refuses to start
  on a dirty tree, so the build is exactly the committed sources plus the
  version change. After packaging it commits `chore(release): release X.Y.Z`
  (the version files at X.Y.Z, plus any other tracked file the run itself
  changed), then commits the -dev bump as `chore(release): start N development`.
  It does not tag: it writes releases/SellfileCreator_vX.Y.Z.release.json with
  the release commit (and the asset pack's commit), and once the zip is checked
  by hand, publish-release.ps1 tags those commits `vX.Y.Z`, pushes, and creates
  the GitHub release. The asset pack is optional: without it the package has
  placeholder icons and the run says so at its start and end; with it, the pack
  must be committed.

  A RELEASE BUILDS FROM ZERO: `npm run wasm:clean` (cargo clean on the wasm
  workspace) plus a wipe of dist.app, and the `npm ci` below replaces
  node_modules from the lockfile. That is the point of a release build - what
  ships is built from the commit, never from whatever an incremental tree
  happened to be holding, and a stale artifact is exactly the failure nobody
  finds until a user does. It costs a full Rust rebuild, which is the price
  rather than something to opt into.

  Two ways past it, both explicit: -DevBuild, which is not a release at all,
  and -NoClean, which is one that knowingly gives up the guarantee - a re-run
  after a late failure, or an iteration where the cold rebuild costs more than
  it proves. What ships from a -NoClean run is NOT known to come from the
  commit alone.
#>

param(
  [switch]$DevBuild,
  [switch]$NoClean,
  [ValidateSet('patch', 'minor', 'major')][string]$Bump = 'patch'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Git, tag and manifest helpers shared with publish-release.ps1.
. (Join-Path $PSScriptRoot 'release-common.ps1')

# Helper: write text as UTF-8 with BOM (required for release README files).
function Write-TextUtf8WithBom([string]$Path, [string]$Text) {
  $enc = New-Object System.Text.UTF8Encoding($true)
  [System.IO.File]::WriteAllText($Path, $Text, $enc)
}

# Helper: keep the Rust workspace version in step with package.json.
# The crates ship inside the app (sfc_engine reports CARGO_PKG_VERSION over its C ABI),
# so their version must be the app's. package.json remains the single source of truth;
# wasm/Cargo.toml just mirrors it via [workspace.package], and every member crate
# inherits that with `version.workspace = true`.
function Set-CrateVersion([string]$RepoRoot, [string]$Version) {
  $cargoPath = Join-Path $RepoRoot 'wasm\Cargo.toml'
  if (-not (Test-Path -LiteralPath $cargoPath)) {
    Write-Warning "wasm/Cargo.toml not found; skipping crate version sync"
    return
  }
  $raw = Read-TextUtf8 $cargoPath
  # Only the version line inside [workspace.package] may move. Anchoring on that header
  # keeps dependency versions ("serde = { version = ... }") untouched.
  $pattern = '(?ms)(^\[workspace\.package\]\s*$.*?^version\s*=\s*")[^"]*(")'
  if ($raw -notmatch $pattern) {
    throw "Could not locate [workspace.package] version in wasm/Cargo.toml"
  }
  $updated = [regex]::Replace($raw, $pattern, "`${1}$Version`${2}", 1)
  Write-TextUtf8NoBom -Path $cargoPath -Text $updated
  # Refresh Cargo.lock so the committed lockfile records the new crate versions.
  # Failure here is non-fatal: the build re-resolves the lockfile anyway.
  Push-Location (Join-Path $RepoRoot 'wasm')
  try {
    # cargo is a native command: a non-zero exit sets $LASTEXITCODE but throws nothing, so
    # the failure has to be read from the exit code rather than caught.
    cargo metadata --format-version 1 --no-deps --quiet > $null 2>&1
    if ($LASTEXITCODE -ne 0) {
      Write-Warning "cargo metadata exited $LASTEXITCODE while refreshing Cargo.lock; the build re-resolves it anyway"
    }
  } finally {
    Pop-Location
  }
}

# Helper: set the package.json version by editing that one line. Re-serializing the
# whole file (ConvertTo-Json) reformatted every line, so each release diff was noise.
# The first "version" key is the top-level one: it sits right below "name".
function Set-PackageVersion([string]$Path, [string]$Version) {
  $raw = Read-TextUtf8 $Path
  if ($raw.Length -gt 0 -and $raw[0] -eq [char]0xFEFF) { $raw = $raw.Substring(1) }
  $pattern = '("version"\s*:\s*")[^"]*(")'
  if ($raw -notmatch $pattern) { throw "Could not locate the version in $Path" }
  Write-TextUtf8NoBom -Path $Path -Text ([regex]::Replace($raw, $pattern, "`${1}$Version`${2}", 1))
}

# Helper: refuse a release from a checkout with uncommitted or untracked files. Untracked
# files count too: a stray preset or doc could be picked up by staging.
function Assert-CleanWorkTree([string]$Dir, [string]$What) {
  $dirty = git -C $Dir status --porcelain
  if ($LASTEXITCODE -ne 0) { throw "git status failed for $What with exit code $LASTEXITCODE" }
  if ($dirty) { throw "$What has uncommitted changes. Commit or stash them before a release:`n$($dirty -join "`n")" }
}

# Helper: the banner for a build without the asset pack, shown at the start and the end
# of the run so a placeholder-icon package is never mistaken for the full version.
function Write-NoAssetsNotice {
  $rule = '  ' + ('*' * 66)
  Write-Host ''
  Write-Host $rule -ForegroundColor Yellow
  Write-Host '  NO ASSET PACK: this package contains NO game artwork.' -ForegroundColor Yellow
  Write-Host '  Champions, sets and factions show placeholder icons.' -ForegroundColor Yellow
  Write-Host '  See "Icon Assets Catalogs" in docs/technical/build-and-tooling.md.' -ForegroundColor Yellow
  Write-Host $rule -ForegroundColor Yellow
  Write-Host ''
}

# Helper: convert README markdown to a flat UTF-8 text file with injected version badge.
function Convert-ReadmeToTxt([string]$SourcePath, [string]$DestinationPath, [string]$VersionLabel) {
  if (-not (Test-Path -LiteralPath $SourcePath)) { return }
  $raw = Read-TextUtf8 $SourcePath
  $lines = $raw -split "\r?\n"
  # Match the app title in its current ("Sellfile Creator for RSL Helper") and legacy
  # ("RSL Helper Sellfile Creator") forms — the same pair the Help dialog strips at render.
  if ($lines.Length -gt 0 -and ($lines[0].StartsWith('# Sellfile Creator for RSL Helper') -or $lines[0].StartsWith('# RSL Helper Sellfile Creator'))) {
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

  # A release must build from a commit: uncommitted edits (release notes, presets, ...)
  # would ship without being in the tagged commit.
  if (-not $DevBuild) {
    Assert-CleanWorkTree -Dir $RepoRoot -What 'The working tree (commit userDocs/HISTORY.md too)'
  }

  # Read version from package.json and normalize depending on mode
  $pkgPath = Join-Path $RepoRoot 'package.json'
  $pkgRaw = Read-TextUtf8 $pkgPath
  $pkg = $pkgRaw | ConvertFrom-Json
  $origVersion = [string]$pkg.version
  if (-not $origVersion) { throw 'Unable to read version from package.json' }
  $releaseVersion = ($origVersion -split '-', 2)[0]

  # The game artwork comes from the asset pack when one is configured; without it the
  # build uses placeholder icons, and the run says so at the start and the end. The
  # lookup is the build's own (print-game-assets-dir.mjs), so it names the pack the
  # build embeds.
  # Collect the output before picking the line: `| Select-Object -First 1` would stop
  # the pipeline early, and Windows PowerShell then reports node's exit code as -1.
  $packOut = @(node scripts/tooling/print-game-assets-dir.mjs)
  if ($LASTEXITCODE -ne 0) { throw "Asset pack lookup failed with exit code $LASTEXITCODE" }
  $packDir = if ($packOut.Count -gt 0) { [string]$packOut[0] } else { '' }
  $withAssets = -not [string]::IsNullOrWhiteSpace($packDir)
  if ($withAssets) { Write-Host 'Asset pack found: the build embeds the game artwork.' -ForegroundColor Green }
  else { Write-NoAssetsNotice }

  # A used pack obeys the same rule as the app: committed, and tagged with the app's
  # version once the release is published. Tags are checked now, before the slow steps,
  # rather than failing after the build.
  $packCommit = $null
  if (-not $DevBuild) {
    Assert-TagFree -Dir $RepoRoot -Tag "v$releaseVersion" -What 'This repository'
    if ($withAssets) {
      Assert-CleanWorkTree -Dir $packDir -What 'The asset pack'
      Assert-TagFree -Dir $packDir -Tag "v$releaseVersion" -What 'The asset pack'
      # Remember the artwork commit now: the pack may move on before the release is published.
      $packCommit = [string](git -C $packDir rev-parse HEAD)
      if ($LASTEXITCODE -ne 0) { throw "git rev-parse failed for the asset pack with exit code $LASTEXITCODE" }
    }
  }

  # Everything from the version clean up to the release commit can fail (a locked file in
  # the clean, a red test, a broken build). Snapshot the files the version clean rewrites,
  # byte for byte, so a failure anywhere in that span puts them back exactly as committed
  # and the tree is ready for the next run.
  $versionFiles = @($pkgPath, (Join-Path $RepoRoot 'wasm\Cargo.toml'), (Join-Path $RepoRoot 'wasm\Cargo.lock'))
  $versionSnapshot = @{}
  foreach ($file in $versionFiles) {
    if (Test-Path -LiteralPath $file) { $versionSnapshot[$file] = [System.IO.File]::ReadAllBytes($file) }
  }
  try {
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
      Set-PackageVersion -Path $pkgPath -Version $releaseVersion
      # The shipped crates carry the app version, so clean them in the same step.
      Set-CrateVersion -RepoRoot $RepoRoot -Version $releaseVersion
    }

    $packageLabel = $releaseVersion
    $versionLabel = $releaseVersion
    $archiveName = "SellfileCreator_v$packageLabel.zip"
  }
  # Archives land in releases/ (gitignored) so build output never clutters the repo root.
  $releasesDir = Get-ReleasesDir $RepoRoot
  if (-not (Test-Path -LiteralPath $releasesDir)) { New-Item -ItemType Directory -Path $releasesDir | Out-Null }
  $archivePath = Join-Path $releasesDir $archiveName

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

  # Build from zero. The DEFAULT for a release: what ships is built from the
  # commit rather than from whatever an incremental tree was holding.
  # -DevBuild is not a release, and -NoClean is one that gives the guarantee up
  # on purpose. Before the install and the build, because both produce exactly
  # what this throws away.
  #
  # What it does NOT touch, all three deliberately:
  #   node_modules  - `npm ci` below already replaces it from the lockfile on
  #                   every non-dev release, so a second wipe is redundant.
  #   tmp/tsc       - scratch this very run writes (export:l10n compiles into
  #                   it a few steps down), so clearing it would be undone.
  #   old_releases  - the local (gitignored) copy of past built HTMLs, which
  #                   this run adds to rather than replaces. Build output is
  #                   disposable; that folder is a record, and a clean is not
  #                   a delete.
  if (-not $DevBuild -and -not $NoClean) {
    Write-Host 'Clean build: wasm workspace + dist.app...'
    npm run --silent wasm:clean
    if ($LASTEXITCODE -ne 0) {
      throw "wasm:clean failed with exit code $LASTEXITCODE"
    }
    $distApp = Join-Path $RepoRoot 'dist.app'
    if (Test-Path -LiteralPath $distApp) { Remove-Item -LiteralPath $distApp -Recurse -Force }
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

  # Build production assets. When a pack was found the build must use it
  # (SFC_REQUIRE_GAME_ASSETS, see scripts/vite/gameIconsPlugin.ts): a configured pack
  # without its ico/ folder fails instead of quietly shipping placeholder icons.
  Write-Host 'Building app (vite build)...'
  $previousRequireAssets = $env:SFC_REQUIRE_GAME_ASSETS
  if ($withAssets) { $env:SFC_REQUIRE_GAME_ASSETS = '1' }
  try {
    npm run --silent build
  } finally {
    $env:SFC_REQUIRE_GAME_ASSETS = $previousRequireAssets
  }
  if ($LASTEXITCODE -ne 0) {
    throw "Build failed with exit code $LASTEXITCODE"
  }

  # Build the decision library that ships under dev/decision-dll/.
  # A release always carries a freshly built one, so the DLL in the archive can never
  # be older than the rules it implements.
  Write-Host 'Building decision library (npm run sfc-engine:build)...'
  npm run --silent sfc-engine:build
  if ($LASTEXITCODE -ne 0) {
    throw "Decision library build failed with exit code $LASTEXITCODE"
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

  # Every user-facing document (READMEs, HISTORY, notices, protocol doc) is sourced from
  # userDocs/. Only the SOURCE location changed — the archive layout below stays as it was.
  $userDocsDir = Join-Path $RepoRoot 'userDocs'
  if (-not (Test-Path -LiteralPath $userDocsDir)) { throw "User docs folder not found: $userDocsDir" }

  # Stage README files (English + localized variants) with version badge
  $readmeSrc = Join-Path $userDocsDir 'README.md'
  if (-not (Test-Path -LiteralPath $readmeSrc)) { throw "README not found: $readmeSrc" }
  Convert-ReadmeToTxt -SourcePath $readmeSrc -DestinationPath (Join-Path $staging 'README.txt') -VersionLabel $versionLabel
  $localizedReadmes = Get-ChildItem -LiteralPath $userDocsDir -Filter 'README.*.md' -File | Where-Object { $_.Name -ne 'README.md' }
  foreach ($file in $localizedReadmes) {
    $destName = "{0}.txt" -f $file.BaseName
    Convert-ReadmeToTxt -SourcePath $file.FullName -DestinationPath (Join-Path $staging $destName) -VersionLabel $versionLabel
  }

  # Include release history at the root of the archive (source is Markdown; shipped as .txt for end users)
  $historySrc = Join-Path $userDocsDir 'HISTORY.md'
  if (-not (Test-Path -LiteralPath $historySrc)) { throw "Release history not found: $historySrc" }
  Copy-Item -LiteralPath $historySrc -Destination (Join-Path $staging 'HISTORY.txt') -Force

  # The project license (AGPL-3.0-or-later) ships at the archive root: AGPL section 6 requires
  # conveyed copies to carry it; the READMEs' License section points to the source code.
  $licenseSrc = Join-Path $RepoRoot 'LICENSE'
  if (-not (Test-Path -LiteralPath $licenseSrc)) { throw "License file not found: $licenseSrc" }
  Copy-Item -LiteralPath $licenseSrc -Destination (Join-Path $staging 'LICENSE.txt') -Force

  # Include third-party notices to satisfy attribution requirements (generated into userDocs/ above)
  $noticesSrc = Join-Path $userDocsDir 'THIRD_PARTY_NOTICES.txt'
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

  # Integrator-facing protocol docs ship under dev/ (sourced from userDocs/, same as the READMEs).
  $protocolDocs = @(
    'websocket-jsonrpc.md'
  )
  foreach ($docPath in $protocolDocs) {
    $docSrc = Join-Path $userDocsDir $docPath
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

  # Ship the decision library and its C sample under dev/decision-dll/.
  #
  # The DLL lets an external program ask "keep or sell?" for a pile of gear and get the
  # SAME answer the app's own preview gives, without reimplementing the rules. It is
  # built by `npm run sfc-engine:build`; the release REQUIRES it rather than silently
  # shipping without it, since a missing library is not something a consumer can
  # diagnose from the archive.
  $decisionDllSrc = Join-Path $RepoRoot 'wasm\target\x86_64-pc-windows-msvc\release\sfc_engine.dll'
  if (-not (Test-Path -LiteralPath $decisionDllSrc)) {
    throw "Decision library not found: $decisionDllSrc. Run: npm run sfc-engine:build"
  }
  $decisionDir = Join-Path $devDir 'decision-dll'
  if (-not (Test-Path $decisionDir)) { New-Item -ItemType Directory -Path $decisionDir | Out-Null }
  Copy-Item -LiteralPath $decisionDllSrc -Destination (Join-Path $decisionDir 'sfc_engine.dll') -Force

  # The integration sample: header, a complete C program, a build script, a README and its
  # MIT license (the kit is MIT so integrators can copy it into any program).
  # Sources only - the archive never carries a prebuilt .exe or .obj.
  $decisionSampleSrc = Join-Path $RepoRoot 'examples\decision-dll'
  foreach ($sampleFile in @('sfc_decide.h', 'sfc_sample.c', 'build.bat', 'README.md', 'LICENSE')) {
    $filePath = Join-Path $decisionSampleSrc $sampleFile
    if (-not (Test-Path -LiteralPath $filePath)) {
      throw "Decision sample file not found: $filePath"
    }
    Copy-Item -LiteralPath $filePath -Destination (Join-Path $decisionDir $sampleFile) -Force
  }

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

  # Create archive in releases/. Use staging as cwd so entries have no subdir paths.
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
      Write-Host "Restoring the version files ($origVersion) after the failure" -ForegroundColor Yellow
      # Write the snapshot back verbatim: re-running the version helpers would re-encode
      # the files and could leave them subtly different from the commit.
      foreach ($file in $versionSnapshot.Keys) { [System.IO.File]::WriteAllBytes($file, $versionSnapshot[$file]) }
      # Anything else the run changed (e.g. regenerated notices) is left for review rather
      # than discarded, since it may be worth keeping; name it so it is not a surprise.
      $leftover = @(git status --porcelain)
      if ($leftover.Count -gt 0) {
        Write-Warning "The failed run left these changes; review or discard them before the next run:`n$($leftover -join "`n")"
      }
    }
    throw
  }

  # Also persist the built HTML to the local, gitignored old_releases folder for quick
  # access/auditing (published builds live as GitHub release assets, not in the repo).
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

  # Record what shipped: the release commit carries the clean version plus anything this
  # run regenerated (the tree was clean at the start, so every tracked change is ours).
  if (-not $DevBuild) {
    Write-Host "Committing release $releaseVersion"
    Invoke-GitChecked add -u
    # --allow-empty: a package.json that already held the clean version leaves nothing
    # to stage, yet the release still gets its own commit to tag.
    Invoke-GitChecked commit --quiet --allow-empty -m "chore(release): release $releaseVersion"
    $releaseCommit = [string](git rev-parse HEAD)
    if ($LASTEXITCODE -ne 0) { throw "git rev-parse failed with exit code $LASTEXITCODE" }
    # No tag yet: the zip still has to be checked by hand. The manifest tells
    # publish-release.ps1 which commits to tag once it is.
    $manifest = [ordered]@{
      version   = $releaseVersion
      archive   = $archiveName
      commit    = $releaseCommit
      assetPack = if ($withAssets) { [ordered]@{ dir = $packDir; commit = $packCommit } } else { $null }
    }
    $manifestPath = Get-ReleaseManifestPath -RepoRoot $RepoRoot -Version $releaseVersion
    Write-TextUtf8NoBom -Path $manifestPath -Text ($manifest | ConvertTo-Json -Depth 3)
  }

# After packaging: bump the -Bump component and add the -dev suffix. Which one
# moves is the caller's choice - the ordinary case steps PATCH (1.0.0 -> 1.0.1),
# and a release carrying a real feature steps MINOR. Everything below the
# bumped component resets to 0.
  if (-not $DevBuild) {
    if ($releaseVersion -match '^(\d+)\.(\d+)\.(\d+)$') {
      $maj = [int]$Matches[1]
      $min = [int]$Matches[2]
      $pat = [int]$Matches[3]
      switch ($Bump) {
        'major' { $maj++; $min = 0; $pat = 0 }
        'minor' { $min++; $pat = 0 }
        'patch' { $pat++ }
      }
      $next = "{0}.{1}.{2}-dev" -f $maj, $min, $pat
      Write-Host "Setting next development version: $next"
      Set-PackageVersion -Path $pkgPath -Version $next
      Set-CrateVersion -RepoRoot $RepoRoot -Version $next
      Invoke-GitChecked add -u
      Invoke-GitChecked commit --quiet -m ("chore(release): start {0}.{1}.{2} development" -f $maj, $min, $pat)
    } else {
      Write-Warning "Release version '$releaseVersion' is not x.y.z; skipping dev bump"
    }
  }

  if (-not $DevBuild) {
    Write-Host "Check $archiveName, then publish it with: npm run release:publish" -ForegroundColor Green
  }

  # Repeat the notice last, where it cannot scroll away behind the build output.
  if (-not $withAssets) { Write-NoAssetsNotice }
} finally {
  # Clean up staging folder to avoid clutter
  if ($staging -and (Test-Path $staging)) { Remove-Item $staging -Recurse -Force }
  Pop-Location
}
