<#
.SYNOPSIS
Launches the JSON-RPC 2.0 WebSocket DB watcher for Sellfile Creator.
#>

# Select the JSON-RPC protocol for the shared core script.
$script:ProtocolMode = 'jsonrpc'

# Dot-source the shared implementation and forward wrapper args unchanged.
. "$PSScriptRoot/run-db-watcher-core.ps1" @args
