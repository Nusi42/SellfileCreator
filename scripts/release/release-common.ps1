<#
  Helpers shared by release-win.ps1 (build) and publish-release.ps1 (publish).
  Dot-source it: `. (Join-Path $PSScriptRoot 'release-common.ps1')`.

  The two scripts hand over through a small manifest written next to the zip in
  releases/: it records which commits the archive was built from, so publishing
  tags exactly those commits even when either repository moved on since.
#>

# Helper: read a text file as UTF-8, dropping a BOM if there is one. Windows PowerShell's
# Get-Content reads a BOM-less file as ANSI, which garbles every non-ASCII character that
# is then written back (an em dash in wasm/Cargo.toml came out as mojibake).
function Read-TextUtf8([string]$Path) {
  $enc = New-Object System.Text.UTF8Encoding($false)
  return [System.IO.File]::ReadAllText($Path, $enc)
}

# Helper: write text as UTF-8 without BOM (works in both Windows PowerShell and PowerShell 7+).
function Write-TextUtf8NoBom([string]$Path, [string]$Text) {
  $enc = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Text, $enc)
}

# Helper: run git, throwing on failure (git is native, so errors arrive as exit codes).
function Invoke-GitChecked {
  & git @args
  if ($LASTEXITCODE -ne 0) { throw "git $($args -join ' ') failed with exit code $LASTEXITCODE" }
}

# Helper: the commit a tag points at, or $null when the tag does not exist.
function Get-TagCommit([string]$Dir, [string]$Tag) {
  $sha = git -C $Dir rev-parse --verify --quiet "refs/tags/$Tag^{commit}"
  if ($LASTEXITCODE -ne 0) { return $null }
  return [string]$sha
}

# Helper: refuse a release whose tag already exists (a re-run after a late failure must
# not move a published tag).
function Assert-TagFree([string]$Dir, [string]$Tag, [string]$What) {
  if (Get-TagCommit -Dir $Dir -Tag $Tag) { throw "$What already has a $Tag tag." }
}

# The build output folder (gitignored) holding the zips and their manifests.
function Get-ReleasesDir([string]$RepoRoot) {
  return (Join-Path $RepoRoot 'releases')
}

# The one spelling of the manifest name; publish-release.ps1 lists manifests by its suffix.
$ReleaseManifestSuffix = '.release.json'
function Get-ReleaseManifestPath([string]$RepoRoot, [string]$Version) {
  return (Join-Path (Get-ReleasesDir $RepoRoot) ("SellfileCreator_v{0}{1}" -f $Version, $ReleaseManifestSuffix))
}
