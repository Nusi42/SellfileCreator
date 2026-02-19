<#
.SYNOPSIS
Launches the lightweight (RSL Helper) WebSocket DB watcher for Sellfile Creator.
#>

# Select the lightweight protocol for the shared core script.
$script:ProtocolMode = 'helper'

# Dot-source the shared implementation and forward wrapper args unchanged.
. "$PSScriptRoot/run-db-watcher-core.ps1" @args
