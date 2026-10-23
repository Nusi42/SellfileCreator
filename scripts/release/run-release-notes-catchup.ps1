<#
.SYNOPSIS
  Release-notes catch-up driver (PowerShell port of run-release-notes-catchup.sh).

.DESCRIPTION
  Scans a branch for releases (the `vX.Y.Z` tags reachable from it), finds which
  ones are missing from userDocs/HISTORY.md, and drives Claude to write the missing
  entries — plus the in-progress entry for the current package.json version.

  Small releases run single-pass; large ones fan out to map workers (bounded diff
  reading) followed by a reducer that writes the bilingual entry.

  Environment overrides (parameters take precedence where both exist):
    RELEASE_NOTES_CATCHUP_ALL=1            Same as -All.
    RELEASE_NOTES_EXTRA_NOTE=<text>        Same as -Note.
    RELEASE_NOTES_BRANCH=<ref>             Same as -Branch.
    RELEASE_NOTES_DATE=<yyyy-mm-dd>        Same as -Date.
    RELEASE_NOTES_SINGLE_PASS_LINES=<int>  Switch to map-reduce above this many changed lines (default 5000).
    RELEASE_NOTES_WORKER_LINES=<int>       Per-worker line budget when chunking (default 3500).
    RELEASE_NOTES_WORKER_MODEL=<model>     Model for map workers (default 'haiku'; empty inherits the CLI default).
    RELEASE_NOTES_REDUCER_MODEL=<model>    Model for reducer / single-pass (default 'sonnet'; empty inherits the CLI default).

.PARAMETER All
  Process every missing release entry instead of only the newest gap.

.PARAMETER Note
  Free-text instruction appended to every Claude prompt in this run (workers,
  reducer, and single-pass alike). Use it to steer emphasis for one release.
  Aliased as -Prompt.

.PARAMETER Branch
  Branch/ref to scan. Overrides the RELEASE_NOTES_BRANCH env var.

.PARAMETER Date
  ISO date (yyyy-mm-dd) for the in-progress entry. Overrides RELEASE_NOTES_DATE.

.EXAMPLE
  npm run release-notes:catchup:win

.EXAMPLE
  npm run release-notes:catchup:win -- -Note "Hotfix; lead with the export crash fix."

.EXAMPLE
  ./scripts/release/run-release-notes-catchup.ps1 -All -Note "Group the WASM work into one bullet."
#>

[CmdletBinding()]
param(
  # Process every missing release entry instead of only the newest gap.
  [switch]$All,

  # Free-text instruction appended to every Claude prompt in this run (workers,
  # reducer, and single-pass alike). Use it to steer emphasis for one release,
  # e.g. -Note 'This is a hotfix; lead with the crash fix.'
  [Alias('Prompt')]
  [string]$Note,

  # Branch/ref to scan. Overrides the RELEASE_NOTES_BRANCH env var.
  [string]$Branch,

  # ISO date (yyyy-mm-dd) for the in-progress entry. Overrides RELEASE_NOTES_DATE.
  [string]$Date
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Anchor at repo root so all paths are predictable.
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Push-Location $RepoRoot

try {

  $PromptMain = 'docs/CREATE-RELEASE-NOTES.md'
  $PromptWorker = 'docs/CREATE-RELEASE-NOTES-WORKER.md'
  $HistoryPath = 'userDocs/HISTORY.md'
  $ChecklistPath = 'PRE-RELEASE-CHECKLIST.md'
  $TempBase = 'docs/.release-notes'

  # ---------------------------------------------------------------------------
  # Environment overrides — parameters win, env vars are the fallback.
  # ---------------------------------------------------------------------------

  # Reads an env var, returning $null when unset OR set to the empty string.
  # PowerShell cannot distinguish those two states, so "" means "not provided".
  function Get-EnvOrNull {
    param([string]$Name)
    $value = [Environment]::GetEnvironmentVariable($Name)
    if ([string]::IsNullOrEmpty($value)) { return $null }
    return $value
  }

  # Same, but preserves an explicitly-set empty value as "" so the caller can
  # distinguish "unset → use default" from "set empty → inherit CLI default".
  # Mirrors bash `${VAR-default}` (no colon) used for the model vars.
  function Get-EnvAllowEmpty {
    param([string]$Name, [string]$Default)
    $value = [Environment]::GetEnvironmentVariable($Name)
    if ($null -eq $value) { return $Default }
    return $value
  }

  # Budgets are measured in changed lines (numstat add+delete), not commit count,
  # because a single 8000-line commit is harder to review than 200 small ones.
  $singlePassRaw = Get-EnvOrNull 'RELEASE_NOTES_SINGLE_PASS_LINES'
  if ($null -eq $singlePassRaw) { $singlePassRaw = '5000' }
  $workerLinesRaw = Get-EnvOrNull 'RELEASE_NOTES_WORKER_LINES'
  if ($null -eq $workerLinesRaw) { $workerLinesRaw = '3500' }

  # Model selection. Workers do bounded diff inspection (Haiku is enough); the
  # reducer / single-pass writes the bilingual final output and judges
  # added-then-removed patterns, so Sonnet is the floor. Set either env var to
  # an empty string to inherit the CLI's default model.
  $WorkerModel = Get-EnvAllowEmpty 'RELEASE_NOTES_WORKER_MODEL' 'haiku'
  $ReducerModel = Get-EnvAllowEmpty 'RELEASE_NOTES_REDUCER_MODEL' 'sonnet'

  # --All has an env-var twin so CI can flip it without touching the call site.
  $processAll = [bool]$All
  if ((Get-EnvOrNull 'RELEASE_NOTES_CATCHUP_ALL') -eq '1') { $processAll = $true }

  # The extra note falls back to an env var for parity with the other overrides.
  if ([string]::IsNullOrWhiteSpace($Note)) {
    $envNote = Get-EnvOrNull 'RELEASE_NOTES_EXTRA_NOTE'
    if ($null -ne $envNote) { $Note = $envNote }
  }
  # Normalize to a plain string so the prompt builder never sees $null.
  if ($null -eq $Note) { $Note = '' }

  # Branch/date parameters fall back to their env vars.
  if ([string]::IsNullOrWhiteSpace($Branch)) {
    $envBranch = Get-EnvOrNull 'RELEASE_NOTES_BRANCH'
    if ($null -ne $envBranch) { $Branch = $envBranch }
  }
  if ([string]::IsNullOrWhiteSpace($Date)) {
    $envDate = Get-EnvOrNull 'RELEASE_NOTES_DATE'
    if ($null -ne $envDate) { $Date = $envDate }
  }

  # ---------------------------------------------------------------------------
  # Input validation
  # ---------------------------------------------------------------------------

  foreach ($path in @($PromptMain, $PromptWorker, $HistoryPath)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
      throw "Required file missing: $path"
    }
  }

  # Parses a positive-integer budget, rejecting junk and non-positive values.
  function ConvertTo-PositiveInt {
    param([string]$Value, [string]$VarName)
    $parsed = 0
    if (-not [int]::TryParse($Value, [ref]$parsed) -or $parsed -le 0) {
      throw "$VarName must be a positive integer (got '$Value')."
    }
    return $parsed
  }

  $SinglePassLineBudget = ConvertTo-PositiveInt $singlePassRaw 'RELEASE_NOTES_SINGLE_PASS_LINES'
  $WorkerLineBudget = ConvertTo-PositiveInt $workerLinesRaw 'RELEASE_NOTES_WORKER_LINES'

  # `claude` must be on PATH — the whole script is a driver around it.
  if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
    throw 'The `claude` CLI was not found on PATH.'
  }

  # ---------------------------------------------------------------------------
  # Git helpers
  # ---------------------------------------------------------------------------

  # Runs git and returns stdout lines, throwing on a non-zero exit. Git writes
  # progress to stderr on some commands, so only the exit code decides failure.
  function Invoke-Git {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$GitArgs)
    $output = & git @GitArgs 2>$null
    if ($LASTEXITCODE -ne 0) {
      throw "git $($GitArgs -join ' ') failed with exit code $LASTEXITCODE"
    }
    return $output
  }

  # True when the ref resolves to a commit. Used to probe branch candidates.
  function Test-GitRef {
    param([string]$Ref)
    & git rev-parse --verify --quiet "$Ref^{commit}" *> $null
    return $LASTEXITCODE -eq 0
  }

  # First resolvable ref among the override, the usual remotes/locals, then HEAD.
  function Select-Branch {
    $candidates = @()
    if (-not [string]::IsNullOrWhiteSpace($Branch)) { $candidates += $Branch }
    $candidates += @('origin/master', 'master', 'origin/main', 'main', 'HEAD')
    foreach ($ref in $candidates) {
      if (Test-GitRef $ref) { return $ref }
    }
    throw "Unable to resolve a branch to scan (checked: $($candidates -join ', '))."
  }

  # Sums added+deleted across non-binary paths ("-" marks binary) in numstat output.
  function Measure-NumstatLines {
    param([string[]]$Lines)
    $total = 0
    foreach ($line in $Lines) {
      if ([string]::IsNullOrWhiteSpace($line)) { continue }
      $fields = $line -split "`t"
      if ($fields.Count -lt 2) { continue }
      if ($fields[0] -eq '-' -or $fields[1] -eq '-') { continue }
      $added = 0; $deleted = 0
      if ([int]::TryParse($fields[0], [ref]$added) -and [int]::TryParse($fields[1], [ref]$deleted)) {
        $total += $added + $deleted
      }
    }
    return $total
  }

  # Changed-line total for a whole range — the single-pass vs map-reduce input.
  function Get-RangeLineCount {
    param([string]$Range)
    return Measure-NumstatLines (Invoke-Git 'log' '--numstat' '--format=' $Range)
  }

  # Changed-line total for one commit — the chunking unit.
  function Get-CommitLineCount {
    param([string]$Commit)
    return Measure-NumstatLines (Invoke-Git 'show' '--numstat' '--format=' $Commit)
  }

  # Walks commits chronologically and groups them into chunks no larger than
  # $WorkerLineBudget. A single commit larger than the budget gets its own
  # chunk — splitting mid-commit would break the deep-review guarantee.
  function Get-ChunkRanges {
    param([string]$Range, [int]$Budget, [string]$PrevCommit)

    $chunks = [System.Collections.Generic.List[string]]::new()
    $prev = $PrevCommit
    $curLast = ''
    $curLines = 0

    # Emits `prev..last` when a baseline exists, else the bare hash (first commit).
    $closeChunk = {
      param([string]$last)
      if (-not [string]::IsNullOrEmpty($prev)) { $chunks.Add("$prev..$last") }
      else { $chunks.Add($last) }
    }

    foreach ($commit in (Invoke-Git 'rev-list' '--reverse' $Range)) {
      if ([string]::IsNullOrWhiteSpace($commit)) { continue }
      $lines = Get-CommitLineCount $commit

      if ([string]::IsNullOrEmpty($curLast)) {
        $curLast = $commit
        $curLines = $lines
      } elseif (($curLines + $lines) -gt $Budget) {
        & $closeChunk $curLast
        # The chunk just closed becomes the baseline for the next one.
        $prev = $curLast
        $curLast = $commit
        $curLines = $lines
      } else {
        $curLast = $commit
        $curLines += $lines
      }
    }

    # Flush the trailing partial chunk.
    if (-not [string]::IsNullOrEmpty($curLast)) { & $closeChunk $curLast }

    return $chunks.ToArray()
  }

  # Extract the "before" side of a `prev..cur` range, or empty for a bare hash.
  function Get-RangePrevCommit {
    param([string]$Range)
    $idx = $Range.IndexOf('..')
    if ($idx -lt 0) { return '' }
    return $Range.Substring(0, $idx)
  }

  # ---------------------------------------------------------------------------
  # History parsing
  # ---------------------------------------------------------------------------

  # Module-scope state refreshed by Update-HistoryVersions.
  $script:HistoryVersions = @()
  $script:LatestHistoryVersion = ''

  function Update-HistoryVersions {
    $versions = [System.Collections.Generic.List[string]]::new()
    # HISTORY.md is UTF-8 with BOM; -Encoding UTF8 strips it so line 1 matches.
    $lines = Get-Content -LiteralPath $HistoryPath -Encoding UTF8
    foreach ($raw in $lines) {
      $line = $raw -replace "`r", ''
      if ($line -match '^##\s+v(\d+\.\d+\.\d+)') {
        $versions.Add($Matches[1])
      }
    }
    $script:HistoryVersions = $versions.ToArray()
    # Newest-first ordering means the first heading is the latest version.
    if ($versions.Count -gt 0) { $script:LatestHistoryVersion = $versions[0] }
    else { $script:LatestHistoryVersion = '' }
  }

  function Test-VersionInHistory {
    param([string]$Version)
    return $script:HistoryVersions -contains $Version
  }

  # Post-run gate: Claude must have left the entry behind, or the run failed.
  function Assert-HistoryEntry {
    param([string]$Version)
    Update-HistoryVersions
    if (-not (Test-VersionInHistory $Version)) {
      throw "$HistoryPath is still missing v$Version after the Claude run. Review the output and fix manually."
    }
  }

  # ---------------------------------------------------------------------------
  # Checklist finalization (mechanical, no AI involvement)
  # ---------------------------------------------------------------------------

  function Complete-Checklist {
    param([string]$Version, [string]$ReleaseDate)

    $src = Join-Path $TempBase (Join-Path $Version 'checklist.md')
    if (-not (Test-Path -LiteralPath $src -PathType Leaf)) {
      Write-Host "No PRE-RELEASE-CHECKLIST items for v$Version."
      return
    }
    $items = @(Get-Content -LiteralPath $src -Encoding UTF8)
    # An empty file is the healthy outcome — nothing to prepend.
    if ($items.Count -eq 0 -or ($items -join '').Trim() -eq '') {
      Write-Host "No PRE-RELEASE-CHECKLIST items for v$Version."
      return
    }

    # Seed the file with a stable header on first use.
    if (-not (Test-Path -LiteralPath $ChecklistPath -PathType Leaf)) {
      $seed = @(
        '# Pre-Release Checklist'
        ''
        'Maintainer-facing review items collected during release-notes runs. Newest first.'
        'Delete entries once handled.'
        ''
      )
      Set-Content -LiteralPath $ChecklistPath -Value $seed -Encoding UTF8
    }

    $existing = @(Get-Content -LiteralPath $ChecklistPath -Encoding UTF8)
    $section = @("## v$Version — $ReleaseDate", '') + $items + @('')

    # Newest section goes directly above the first existing "## vX.Y.Z" heading,
    # which keeps the file's H1 and its intro prose on top while preserving
    # newest-first ordering. Falls back to appending when there is no such
    # heading yet (first real run, or a file with no version sections).
    $out = [System.Collections.Generic.List[string]]::new()
    $inserted = $false
    foreach ($line in $existing) {
      if (-not $inserted -and $line -match '^##\s+v\d+\.\d+\.\d+') {
        foreach ($s in $section) { $out.Add($s) }
        $inserted = $true
      }
      $out.Add($line)
    }
    if (-not $inserted) {
      # Separate from the header/prose block above, then append.
      if ($out.Count -gt 0 -and -not [string]::IsNullOrWhiteSpace($out[$out.Count - 1])) { $out.Add('') }
      foreach ($s in $section) { $out.Add($s) }
    }

    Set-Content -LiteralPath $ChecklistPath -Value $out.ToArray() -Encoding UTF8
    Write-Host "Prepended checklist items for v$Version to $ChecklistPath."
  }

  # ---------------------------------------------------------------------------
  # Claude invocation
  # ---------------------------------------------------------------------------

  # Builds the stdin payload: the prompt file, the per-run context block, and
  # (when supplied) the caller's extra instruction as its own labelled section.
  function New-ClaudeInput {
    param([string]$PromptPath, [string]$Context)

    $body = Get-Content -LiteralPath $PromptPath -Raw -Encoding UTF8
    $parts = @($body, '', '---', 'Context for this run:', $Context)
    if (-not [string]::IsNullOrWhiteSpace($Note)) {
      # Labelled as an operator instruction so Claude weighs it above the
      # mechanical context lines but below the prompt document's hard rules.
      $parts += @('', '---', 'Additional instruction from the maintainer for this run:', $Note)
    }
    return ($parts -join "`n")
  }

  # Runs Claude with the composed prompt on stdin. $EnvVars are set for the child
  # process only. Empty $Model means "inherit the CLI's default" — no --model flag.
  function Invoke-Claude {
    param(
      [string]$PromptPath,
      [string]$Model,
      [string]$Context,
      [hashtable]$EnvVars
    )

    $stdin = New-ClaudeInput -PromptPath $PromptPath -Context $Context

    $claudeArgs = @('-p')
    if (-not [string]::IsNullOrEmpty($Model)) { $claudeArgs += @('--model', $Model) }
    $claudeArgs += @('--dangerously-skip-permissions', '--add-dir', $RepoRoot)

    # Snapshot the vars we touch so the caller's shell is left unchanged — the
    # bash original got this free via `env KEY=VAL cmd`.
    $saved = @{}
    foreach ($key in $EnvVars.Keys) {
      $saved[$key] = [Environment]::GetEnvironmentVariable($key)
    }
    try {
      foreach ($key in $EnvVars.Keys) {
        [Environment]::SetEnvironmentVariable($key, [string]$EnvVars[$key])
      }
      # Pipe the prompt in rather than passing it as an argument: release prompts
      # are far past any command-line length limit.
      $stdin | & claude @claudeArgs
      if ($LASTEXITCODE -ne 0) {
        throw "claude exited with code $LASTEXITCODE"
      }
    } finally {
      foreach ($key in $saved.Keys) {
        [Environment]::SetEnvironmentVariable($key, $saved[$key])
      }
    }
  }

  # ---------------------------------------------------------------------------
  # Single-pass and map-reduce dispatch
  # ---------------------------------------------------------------------------

  # Creates the per-version scratch dir and truncates the shared checklist file.
  function Initialize-TempDir {
    param([string]$Version)
    $dir = Join-Path $TempBase $Version
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
    Set-Content -LiteralPath (Join-Path $dir 'checklist.md') -Value '' -NoNewline -Encoding UTF8
    return $dir
  }

  function Invoke-SinglePass {
    param([string]$Version, [string]$Range, [string]$ReleaseDate, [string]$Status, [string]$ScannedBranch)

    $tempDir = Initialize-TempDir $Version
    $checklistFile = Join-Path $tempDir 'checklist.md'

    $context = @(
      "- Branch scanned: $ScannedBranch"
      "- Target version: v$Version"
      "- Release date: $ReleaseDate"
      "- Commit range: $Range"
      "- Release status: $Status"
      '- Bullets directory: <empty — single-pass; read commits directly>'
      "- Checklist file: $checklistFile (append maintainer review items here)"
    ) -join "`n"

    $modelLabel = if ([string]::IsNullOrEmpty($ReducerModel)) { '<cli default>' } else { $ReducerModel }
    Write-Host "Single-pass Claude run for v$Version (range $Range, model $modelLabel)."

    Invoke-Claude -PromptPath $PromptMain -Model $ReducerModel -Context $context -EnvVars @{
      TARGET_VERSION = $Version
      COMMIT_RANGE   = $Range
      RELEASE_DATE   = $ReleaseDate
      RELEASE_STATUS = $Status
      BULLETS_DIR    = ''
      CHECKLIST_FILE = $checklistFile
    }
  }

  function Invoke-MapReduce {
    param([string]$Version, [string]$Range, [string]$ReleaseDate, [string]$Status, [string]$ScannedBranch)

    $tempDir = Initialize-TempDir $Version
    $checklistFile = Join-Path $tempDir 'checklist.md'
    # Stale bullet files from a failed run would be re-read by the reducer.
    Get-ChildItem -LiteralPath $tempDir -Filter 'chunk-*.bullets.md' -ErrorAction SilentlyContinue |
      Remove-Item -Force

    $prev = Get-RangePrevCommit $Range
    $chunkRanges = @(Get-ChunkRanges -Range $Range -Budget $WorkerLineBudget -PrevCommit $prev)
    $total = $chunkRanges.Count
    if ($total -eq 0) {
      Write-Host "Map-reduce for v${Version}: no commits in range $Range."
      return
    }

    $workerLabel = if ([string]::IsNullOrEmpty($WorkerModel)) { '<cli default>' } else { $WorkerModel }
    $reducerLabel = if ([string]::IsNullOrEmpty($ReducerModel)) { '<cli default>' } else { $ReducerModel }
    Write-Host "Map-reduce for v${Version}: $total chunk(s), $WorkerLineBudget-line budget per worker (worker model $workerLabel, reducer model $reducerLabel)."

    $n = 1
    foreach ($chunkRange in $chunkRanges) {
      $out = Join-Path $tempDir ('chunk-{0:D3}.bullets.md' -f $n)
      Set-Content -LiteralPath $out -Value '' -NoNewline -Encoding UTF8

      $workerContext = @(
        "- Branch scanned: $ScannedBranch"
        "- Target version: v$Version"
        "- Worker: $n of $total"
        "- Commit range for this worker: $chunkRange"
        "- Output bullets file (overwrite): $out"
        "- Output checklist file (append-only, shared across workers): $checklistFile"
      ) -join "`n"

      Write-Host "  Worker $n/$total — range $chunkRange"
      Invoke-Claude -PromptPath $PromptWorker -Model $WorkerModel -Context $workerContext -EnvVars @{
        TARGET_VERSION = $Version
        COMMIT_RANGE   = $chunkRange
        BULLETS_FILE   = $out
        CHECKLIST_FILE = $checklistFile
      }

      $n++
    }

    $reducerContext = @(
      "- Branch scanned: $ScannedBranch"
      "- Target version: v$Version"
      "- Release date: $ReleaseDate"
      "- Commit range (full): $Range"
      "- Release status: $Status"
      "- Bullets directory: $tempDir"
      '- Checklist file: <empty — workers already populated PRE-RELEASE-CHECKLIST data>'
    ) -join "`n"

    Write-Host "  Reducer — consolidating $total bullet files into $HistoryPath."
    Invoke-Claude -PromptPath $PromptMain -Model $ReducerModel -Context $reducerContext -EnvVars @{
      TARGET_VERSION = $Version
      COMMIT_RANGE   = $Range
      RELEASE_DATE   = $ReleaseDate
      RELEASE_STATUS = $Status
      BULLETS_DIR    = $tempDir
      CHECKLIST_FILE = ''
    }
  }

  # Picks single-pass vs map-reduce by changed-line count, then finalizes.
  function Invoke-Release {
    param([string]$Version, [string]$Range, [string]$ReleaseDate, [string]$Status, [string]$ScannedBranch)

    $lines = Get-RangeLineCount $Range
    Write-Host "v${Version}: $lines changed lines in $Range (status=$Status)."

    if ($lines -le $SinglePassLineBudget) {
      Invoke-SinglePass -Version $Version -Range $Range -ReleaseDate $ReleaseDate -Status $Status -ScannedBranch $ScannedBranch
    } else {
      Write-Host "Lines exceed single-pass budget ($SinglePassLineBudget); switching to map-reduce."
      Invoke-MapReduce -Version $Version -Range $Range -ReleaseDate $ReleaseDate -Status $Status -ScannedBranch $ScannedBranch
    }

    Complete-Checklist -Version $Version -ReleaseDate $ReleaseDate

    # released-verify can legitimately leave HISTORY.md unchanged because the
    # entry already exists; in that case Assert-HistoryEntry still passes.
    Assert-HistoryEntry $Version

    # Clean up scratch on success. Failed runs leave the dir behind for inspection.
    Remove-Item -LiteralPath (Join-Path $TempBase $Version) -Recurse -Force -ErrorAction SilentlyContinue
  }

  # ---------------------------------------------------------------------------
  # Main flow: catch-up missing release entries, then handle in-progress version
  # ---------------------------------------------------------------------------

  Update-HistoryVersions
  # Empty history forces full backfill regardless of --All.
  if ([string]::IsNullOrEmpty($script:LatestHistoryVersion)) { $processAll = $true }

  $scanBranch = Select-Branch
  Write-Host "Release-notes catch-up: scanning $scanBranch"
  if (-not [string]::IsNullOrWhiteSpace($Note)) {
    Write-Host "Maintainer instruction for this run: $Note"
  }

  # Every release is a `vX.Y.Z` tag on the commit that shipped. Commit subjects are
  # deliberately not used: they are prose, not a stable marker.
  # Newest-first by version, which is also chronological order.
  $releaseCommits = [System.Collections.Generic.List[string]]::new()
  $releaseDates = [System.Collections.Generic.List[string]]::new()
  $releaseVersions = [System.Collections.Generic.List[string]]::new()
  foreach ($tag in (Invoke-Git 'tag' '--list' 'v[0-9]*' '--merged' $scanBranch '--sort=-v:refname')) {
    # Skip anything that is not a plain release tag (e.g. a prerelease name).
    if ($tag -notmatch '^v(\d+\.\d+\.\d+)$') { continue }
    $version = $Matches[1]
    # Peel annotated tags to their commit; the commit date is the release date.
    $parts = ((Invoke-Git 'log' '-1' '--format=%H|%cs' "$tag^{commit}") | Select-Object -First 1) -split '\|', 2
    $releaseCommits.Add($parts[0])
    $releaseDates.Add($parts[1])
    $releaseVersions.Add($version)
  }

  # Without tags every commit would count as unreleased and the run would summarize the
  # entire history into one entry. An existing history proves tags should exist.
  if ($releaseVersions.Count -eq 0 -and -not [string]::IsNullOrEmpty($script:LatestHistoryVersion)) {
    throw "No vX.Y.Z release tags are reachable from $scanBranch, but $HistoryPath already lists v$($script:LatestHistoryVersion). Fetch the tags (git fetch --tags) before running the catch-up."
  }

  $missingIndices = [System.Collections.Generic.List[int]]::new()
  for ($i = 0; $i -lt $releaseVersions.Count; $i++) {
    if (-not (Test-VersionInHistory $releaseVersions[$i])) { $missingIndices.Add($i) }
  }

  if (-not $processAll -and $missingIndices.Count -gt 1) {
    # Lowest index = newest release, since the tags are listed newest-first.
    $newestIdx = ($missingIndices | Sort-Object)[0]
    Write-Host "Multiple release entries are missing; defaulting to the newest gap (v$($releaseVersions[$newestIdx])). Pass -All to backfill everything."
    $missingIndices = [System.Collections.Generic.List[int]]::new()
    $missingIndices.Add($newestIdx)
  }

  # Sort oldest → newest (descending index) so backfill respects chronology.
  $orderedMissing = @($missingIndices | Sort-Object -Descending)

  foreach ($idx in $orderedMissing) {
    $commit = $releaseCommits[$idx]
    $version = $releaseVersions[$idx]
    $isoDate = $releaseDates[$idx]

    # The next-older release is the range baseline; none for the first.
    $prevCommit = ''
    if ($idx -lt ($releaseCommits.Count - 1)) { $prevCommit = $releaseCommits[$idx + 1] }

    $commitRange = if ($prevCommit) { "$prevCommit..$commit" } else { $commit }

    Invoke-Release -Version $version -Range $commitRange -ReleaseDate $isoDate -Status 'new-entry' -ScannedBranch $scanBranch
  }

  # Refresh history before the in-progress check.
  Update-HistoryVersions

  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Node.js is required to inspect package.json.'
  }

  $pkgVersion = (node -p "JSON.parse(require('fs').readFileSync('package.json','utf8')).version") | Select-Object -First 1
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($pkgVersion)) {
    throw 'Unable to read version from package.json.'
  }
  $pkgVersion = $pkgVersion.Trim()

  # Strip any prerelease suffix: 1.2.3-beta.1 → 1.2.3.
  $targetVersion = ($pkgVersion -split '-', 2)[0]
  if ([string]::IsNullOrWhiteSpace($targetVersion)) {
    throw "Failed to derive release version from package.json version '$pkgVersion'."
  }
  $pkgVersionIsPrerelease = $pkgVersion.Contains('-')

  # Skip in-progress when the package version is already released (tagged).
  $isReleased = $releaseVersions -contains $targetVersion

  if ($isReleased) {
    Write-Host "Latest package version (v$targetVersion) is already tagged as released; no in-progress notes to update."
  } else {
    # Everything since the newest release is the in-progress window.
    $prevCommit = ''
    if ($releaseCommits.Count -gt 0) { $prevCommit = $releaseCommits[0] }
    $commitRange = if ($prevCommit) { "$prevCommit..HEAD" } else { 'HEAD' }

    $commitCount = [int]((Invoke-Git 'rev-list' '--count' $commitRange) | Select-Object -First 1)
    if ($commitCount -eq 0) {
      Write-Host 'No commits between the last release and HEAD; skipping in-progress notes.'
    } else {
      $entryExists = Test-VersionInHistory $targetVersion

      $releaseDate = if (-not [string]::IsNullOrWhiteSpace($Date)) { $Date } else { (Get-Date -Format 'yyyy-MM-dd') }
      $branchCurrent = (Invoke-Git 'rev-parse' '--abbrev-ref' 'HEAD') | Select-Object -First 1

      # An existing entry for an unreleased version gets extended; an existing
      # entry for a released one is only verified.
      $status = 'new-entry'
      if ($entryExists) {
        if ($pkgVersionIsPrerelease -and $targetVersion -eq $script:LatestHistoryVersion) {
          $status = 'unreleased-extend'
        } else {
          $status = 'released-verify'
        }
      }

      Invoke-Release -Version $targetVersion -Range $commitRange -ReleaseDate $releaseDate -Status $status -ScannedBranch $branchCurrent
    }
  }

  Write-Host "Release-notes workflow finished. Review $HistoryPath and PRE-RELEASE-CHECKLIST.md."

} finally {
  Pop-Location
}
