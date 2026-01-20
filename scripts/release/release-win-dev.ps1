<#
  Dev wrapper for release-win.ps1.
  Keeps the existing entry point but delegates to release-win.ps1 -DevBuild to
  avoid duplicating the implementation.
#>

param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Forward
)

$scriptPath = Join-Path $PSScriptRoot 'release-win.ps1'
if (-not (Test-Path -LiteralPath $scriptPath)) {
  throw "release-win.ps1 not found at $scriptPath"
}

& $scriptPath -DevBuild @Forward
exit $LASTEXITCODE
