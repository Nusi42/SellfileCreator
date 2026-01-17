<#
.SYNOPSIS
Launches the lightweight (RSL-style) WebSocket DB watcher for Sellfile Creator.
#>

# Select the lightweight protocol for the shared core script.
$script:ProtocolMode = 'rsl'

# Dot-source the shared implementation so it can read the wrapper args.
. "$PSScriptRoot/run-db-watcher-core.ps1"
