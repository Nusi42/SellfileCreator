<#
.SYNOPSIS
Launches the JSON-RPC 2.0 WebSocket DB watcher for Sellfile Creator.
#>

# Select the JSON-RPC protocol for the shared core script.
$script:ProtocolMode = 'jsonrpc'

# Dot-source the shared implementation so it can read the wrapper args.
. "$PSScriptRoot/run-db-watcher-core.ps1"
