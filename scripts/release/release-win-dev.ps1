<#
  Dev wrapper for release-win.ps1.
  Keeps the existing entry point while forwarding any extra args to the main script.
#>

# Capture raw script arguments to avoid PowerShell parameter binding edge cases.
$forward = @()
if ($args.Count -gt 0) {
  # Preserve the original ordering of any extra arguments.
  $forward = $args
}

# Resolve the sibling release script path from this script's directory.
$scriptPath = Join-Path $PSScriptRoot 'release-win.ps1'
if (-not (Test-Path -LiteralPath $scriptPath)) {
  throw "release-win.ps1 not found at $scriptPath"
}

# Invoke the main release script in dev mode, forwarding any raw args.
& $scriptPath -DevBuild @forward
# Mirror the exit code for CI/scripting correctness.
exit $LASTEXITCODE
