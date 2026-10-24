<#
  Publishes a release that release-win.ps1 built, once its zip has been checked.

  Reads releases/SellfileCreator_vX.Y.Z.release.json (written by release-win.ps1)
  and then, after one confirmation:
    1. tags the release commit `vX.Y.Z` here, and the recorded commit of the asset
       pack (when the build used one) with the same tag;
    2. pushes: `git push github main --follow-tags` here, `git push --follow-tags`
       in the pack;
    3. creates the GitHub release `vX.Y.Z` on that tag in the public repository
       (`repository.url` in package.json, the one the app's update check reads),
       with that version's HISTORY entry as its text and the zip attached.

  Every step checks first, so a re-run after a failure picks up where it stopped:
  an existing tag is fine when it points at the recorded commit. An existing GitHub
  release stops the run.

  -Version X.Y.Z picks the release (default: the newest manifest in releases/).
  -Yes skips the confirmation prompt (for non-interactive runs).
  Needs the GitHub CLI (`gh`), logged in once with `gh auth login`.
#>

param(
  [string]$Version,
  [switch]$Yes
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Git, tag and manifest helpers shared with release-win.ps1.
. (Join-Path $PSScriptRoot 'release-common.ps1')

# Remote and branch of this repository that releases are pushed to.
$SourceRemote = 'github'
$SourceBranch = 'main'

# Helper: run a native command and report only whether it succeeded. Windows PowerShell
# turns redirected stderr into a terminating error under 'Stop', so relax it for the probe.
function Test-NativeSucceeds([scriptblock]$Command) {
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    & $Command > $null 2>&1
    return ($LASTEXITCODE -eq 0)
  } finally {
    $ErrorActionPreference = $previous
  }
}

# Helper: the GitHub CLI from PATH, or from its default install folder.
function Resolve-GhPath {
  $cmd = Get-Command gh -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $fallback = Join-Path $env:ProgramFiles 'GitHub CLI\gh.exe'
  if (Test-Path -LiteralPath $fallback) { return $fallback }
  throw 'GitHub CLI (gh) not found. Install it from https://cli.github.com and run: gh auth login'
}

# Helper: tag a commit, or accept the tag when it already marks that very commit.
function Set-ReleaseTag([string]$Dir, [string]$Tag, [string]$Commit, [string]$What) {
  $existing = Get-TagCommit -Dir $Dir -Tag $Tag
  if ($existing) {
    if ($existing -ne $Commit) { throw "$What already has $Tag on $existing, not on the released commit $Commit." }
    Write-Host "$What already tagged $Tag."
    return
  }
  Invoke-GitChecked -C $Dir tag -a $Tag -m ("Release {0}" -f $Tag.TrimStart('v')) $Commit
  Write-Host "Tagged $What $Tag."
}

# Resolve repo root (this script lives in ./scripts/release).
$RepoRoot = Resolve-Path (Join-Path -Path $PSScriptRoot -ChildPath '..\..')
$work = $null
try {
  # The public repository releases go to: package.json `repository.url`, the same value
  # the app's update check reads (src/lib/releaseRepo.ts). gh wants its OWNER/REPO form.
  $repoUrl = [string](Read-TextUtf8 (Join-Path $RepoRoot 'package.json') | ConvertFrom-Json).repository.url
  if (-not $repoUrl) { throw 'package.json has no repository.url to publish to.' }
  $releaseRepo = ([uri]$repoUrl).AbsolutePath.Trim('/')

  # --- Pick the release -------------------------------------------------------------
  if (-not $Version) {
    $releasesDir = Get-ReleasesDir $RepoRoot
    $candidates = @(Get-ChildItem -LiteralPath $releasesDir -Filter "*$ReleaseManifestSuffix" -File -ErrorAction SilentlyContinue)
    if ($candidates.Count -eq 0) { throw "No release manifest in $releasesDir. Build one first: npm run release:win" }
    # Newest by version number, not by name (1.0.10 sorts after 1.0.9).
    $newest = $candidates | ForEach-Object { Read-TextUtf8 $_.FullName | ConvertFrom-Json } |
      Sort-Object { [version]$_.version } -Descending | Select-Object -First 1
    $Version = [string]$newest.version
  }
  $manifestPath = Get-ReleaseManifestPath -RepoRoot $RepoRoot -Version $Version
  if (-not (Test-Path -LiteralPath $manifestPath)) { throw "Release manifest not found: $manifestPath" }
  $manifest = Read-TextUtf8 $manifestPath | ConvertFrom-Json
  $tag = "v$($manifest.version)"
  $zipPath = Join-Path (Get-ReleasesDir $RepoRoot) $manifest.archive
  if (-not (Test-Path -LiteralPath $zipPath)) { throw "Release archive not found: $zipPath" }
  $pack = $manifest.assetPack

  # --- Preflight: everything that can fail without side effects ---------------------
  $gh = Resolve-GhPath
  if (-not (Test-NativeSucceeds { & $gh auth status })) { throw 'GitHub CLI is not logged in. Run: gh auth login' }
  if (Test-NativeSucceeds { & $gh release view $tag -R $releaseRepo }) {
    throw "$releaseRepo already has a $tag release. Nothing to publish."
  }
  # The released commit must be on the branch that gets pushed, or the tag would
  # publish a commit the public history does not contain.
  if (-not (Test-NativeSucceeds { git -C $RepoRoot merge-base --is-ancestor $manifest.commit $SourceBranch })) {
    throw "The release commit $($manifest.commit) is not on $SourceBranch."
  }
  if ($pack -and -not (Test-NativeSucceeds { git -C $pack.dir cat-file -e "$($pack.commit)^{commit}" })) {
    throw "The asset pack commit $($pack.commit) is missing from $($pack.dir)."
  }
  # Refuse a moved tag now rather than halfway through.
  foreach ($target in @(@{ Dir = $RepoRoot; Commit = $manifest.commit; What = 'This repository' }) +
      @(if ($pack) { @{ Dir = $pack.dir; Commit = $pack.commit; What = 'The asset pack' } })) {
    $existing = Get-TagCommit -Dir $target.Dir -Tag $tag
    if ($existing -and $existing -ne $target.Commit) { throw "$($target.What) already has $tag on another commit ($existing)." }
  }

  # The release text is taken from the release commit, so what is published is what shipped.
  $work = Join-Path ([System.IO.Path]::GetTempPath()) ("sfc-publish-{0}" -f [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $work | Out-Null
  $docsZip = Join-Path $work 'docs.zip'
  Invoke-GitChecked -C $RepoRoot archive --format=zip -o $docsZip $manifest.commit userDocs/HISTORY.md
  $docsDir = Join-Path $work 'docs'
  Expand-Archive -LiteralPath $docsZip -DestinationPath $docsDir
  $historyPath = Join-Path $docsDir 'userDocs\HISTORY.md'

  # The release text is this version's HISTORY entry, up to the next version heading.
  $history = [System.IO.File]::ReadAllText($historyPath)
  $sectionPattern = '(?ms)^## ' + [regex]::Escape($tag) + '\b.*?(?=^## v|\z)'
  $section = [regex]::Match($history, $sectionPattern)
  if (-not $section.Success) { throw "userDocs/HISTORY.md at the release commit has no '## $tag' entry." }
  $notesPath = Join-Path $work 'notes.md'
  Write-TextUtf8NoBom -Path $notesPath -Text $section.Value.Trim()

  # --- Confirm ----------------------------------------------------------------------
  Write-Host ''
  Write-Host "Publish $tag" -ForegroundColor Cyan
  Write-Host "  Archive:        $zipPath"
  Write-Host "  Release commit: $($manifest.commit)"
  if ($pack) { Write-Host "  Asset pack:     $($pack.commit)" } else { Write-Host '  Asset pack:     none (placeholder icons)' -ForegroundColor Yellow }
  Write-Host "  Pushes:         $SourceRemote $SourceBranch + tags$(if ($pack) { ', asset pack + tags' })"
  Write-Host "  Release:        $releaseRepo ($tag with the HISTORY entry and the zip)"
  Write-Host ''
  Write-Host '--- release text ---'
  Write-Host $section.Value.Trim()
  Write-Host '--------------------'
  if (-not $Yes) {
    $answer = Read-Host "Type 'yes' to publish $tag"
    if ($answer -ne 'yes') { Write-Host 'Cancelled. Nothing was changed.'; return }
  }

  # --- Tag and push the sources -----------------------------------------------------
  Set-ReleaseTag -Dir $RepoRoot -Tag $tag -Commit $manifest.commit -What 'This repository'
  if ($pack) { Set-ReleaseTag -Dir $pack.dir -Tag $tag -Commit $pack.commit -What 'The asset pack' }
  Write-Host "Pushing $SourceRemote $SourceBranch..."
  Invoke-GitChecked -C $RepoRoot push $SourceRemote $SourceBranch --follow-tags
  if ($pack) {
    Write-Host 'Pushing the asset pack...'
    Invoke-GitChecked -C $pack.dir push --follow-tags
  }

  # --- Create the GitHub release on the pushed tag ----------------------------------
  # --verify-tag: the tag must already be on GitHub (pushed above), so gh never creates
  # a tag of its own on whatever main happens to be.
  Write-Host "Creating the $tag release..."
  & $gh release create $tag $zipPath -R $releaseRepo --verify-tag --title $tag --notes-file $notesPath
  if ($LASTEXITCODE -ne 0) { throw "gh release create failed with exit code $LASTEXITCODE" }
  Write-Host "Published ${tag}: $repoUrl/releases/tag/$tag" -ForegroundColor Green
} finally {
  if ($work -and (Test-Path -LiteralPath $work)) { Remove-Item -LiteralPath $work -Recurse -Force }
}
