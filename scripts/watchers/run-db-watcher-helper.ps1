<#
.SYNOPSIS
Launches the lightweight (RSL Helper) WebSocket DB watcher for Sellfile Creator.
#>

# Select the lightweight protocol for the shared core script.
$script:ProtocolMode = 'helper'

# Dot-source the shared implementation so it can read the wrapper args.
. "$PSScriptRoot/run-db-watcher-core.ps1"
