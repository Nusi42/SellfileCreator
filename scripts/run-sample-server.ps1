<#!
.SYNOPSIS
Sample push receiver that hosts the Sellfile Creator preview and accepts pushed
`.hsf` payloads.

.DESCRIPTION
This script serves two purposes:
1. Document the minimal HTTP surface an external tool must expose so Sellfile
   Creator can push `.hsf` payloads and poll for out-of-band commands (using the
   RSL Helper sell-file schema).
2. Provide an isolated demo harness with keyboard shortcuts and canned payloads
   for local experimentation.

The protocol-focused sections are marked explicitly. Everything else supports
the demo harness and can be ignored by real integrations.
#>
[CmdletBinding()]
param(
    [int]$Port = 4242,
    [string]$AppRoot = (Split-Path -Parent $PSScriptRoot),
    [string]$OutputPath = (Join-Path $PSScriptRoot 'mock-export.hsf'),
    [switch]$LaunchOnly,
    [switch]$OpenOnSave,
    [Parameter(DontShow = $true)]
    [switch]$SkipRelaunch
)

Set-StrictMode -Version Latest

#region === Protocol quick reference (copy-worthy) ===
# Endpoints below describe the required HTTP surface. Later sections add demo
# helpers and can be omitted in production code.
$script:PushProtocolReference = [ordered]@{
    EndpointSummary = 'Sellfile Creator pushes to http://localhost:<port>/'
    Paths = [ordered]@{
        UploadSellfile = [ordered]@{
            Method        = 'PUT'
            Path          = '/'
            RequestBody   = 'Raw .hsf JSON (see sample-upload-body.json). Persist bytes verbatim.'
            ContentType   = 'application/json; charset=utf-8'
            Response      = '204 No Content + CORS headers. Do not mutate the payload.'
        }
        PollCommands = [ordered]@{
            Method        = 'GET'
            Path          = '/commands'
            ResponseShape = '{ "events": CommandEvent[] } (see sample-commands-response.json)'
            Events        = @(
                'selectRule → { type: "selectRule", ruleIndex, ruleId? }',
                'testerItems → { type: "testerItems", items: ArtifactSummary[], openTester }'
            )
            Notes         = 'Each GET drains the queue; no cursor parameter is needed.'
        }
        QueueCommands = [ordered]@{
            Method      = 'POST'
            Path        = '/commands'
            Role        = 'Optional helper for diagnostics; mirrors what GET /commands exposes.'
            RequestBody = 'JSON object { type: string, ...payload } forwarded to the queue.'
            Response    = '202 Accepted. Not required in production.'
        }
        Preflight = [ordered]@{
            Method   = 'OPTIONS'
            Path     = 'Any of the above'
            Response = '204 No Content with permissive CORS headers.'
        }
    }
}

# Shared constants keep the protocol paths in one place so the demo helpers do
# not diverge from the documented contract.
Set-Variable -Name 'PushProtocolUploadPath' -Option Constant -Value '/'
Set-Variable -Name 'PushProtocolCommandsPath' -Option Constant -Value '/commands'
#endregion

#region === PowerShell host bootstrap (demo-only) ===
# Sellfile Creator ships with a ps1 wrapper for Windows. This script re-launches
# under PowerShell 7 (`pwsh`) because the HTTP APIs used here are only available
# there. Production hosts can wire the listener directly and skip this logic.
$runningOnPwsh7 = ($PSVersionTable.PSVersion.Major -ge 7 -and $PSVersionTable.PSEdition -eq 'Core')
if (-not $runningOnPwsh7) {
    if ($SkipRelaunch) {
        Write-Error 'PowerShell 7 (pwsh) is required to run this script. Download it from https://aka.ms/powershell and retry.'
        exit 1
    }

    $pwshCommand = Get-Command -Name pwsh -ErrorAction SilentlyContinue
    if (-not $pwshCommand) {
        Write-Error 'PowerShell 7 (pwsh) was not found on PATH. Install it from https://aka.ms/powershell and rerun this script.'
        exit 1
    }

    $argumentList = New-Object 'System.Collections.Generic.List[string]'
    $null = $argumentList.Add('-NoProfile')
    $null = $argumentList.Add('-File')
    $null = $argumentList.Add($PSCommandPath)

    foreach ($entry in $PSBoundParameters.GetEnumerator()) {
        switch ($entry.Key) {
            'SkipRelaunch' { continue }
            'LaunchOnly'   { if ($entry.Value) { $null = $argumentList.Add('-LaunchOnly') } continue }
            'OpenOnSave'   { if ($entry.Value) { $null = $argumentList.Add('-OpenOnSave') } continue }
            default        { $null = $argumentList.Add('-' + $entry.Key); $null = $argumentList.Add([string]$entry.Value) }
        }
    }

    $null = $argumentList.Add('-SkipRelaunch')
    $process = Start-Process -FilePath $pwshCommand.Path -ArgumentList $argumentList -Wait -PassThru
    exit ($process.ExitCode)
}

try {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
} catch {
    Write-Verbose "Failed to set console output encoding to UTF-8: $_"
}
#endregion

Add-Type -AssemblyName System.Net.HttpListener -ErrorAction SilentlyContinue | Out-Null

#region === Protocol state (copy-worthy) ===
# Everything in this region demonstrates the state a push listener needs to keep
# for the wire protocol. The queue is intentionally tiny and uses plain
# hashtables so the shapes are easy to inspect in the console.
$script:PushProtocolState = [ordered]@{
    CommandQueue   = New-Object 'System.Collections.Generic.List[Hashtable]'
    QueueLock      = New-Object object
    MaxQueueLength = 200
}
#endregion

#region === Demo harness state (optional) ===
# Demo helpers supply keyboard shortcuts and sample payloads. None of this is
# required for a production integration.
$script:DemoState = [ordered]@{
    TesterSampleFactories = @(
        @{
            Label   = 'Perception speed/crit mix'
            Factory = {
                @(
                    @{
                        ArtifactType = 3
                        ArtifactSet  = 7
                        Rank         = 6
                        Rarity       = 5
                        Level        = 16
                        MainStatID   = 8
                        MainStatF    = 0
                        Substats     = @(
                            @{ ID = 1; IsFlat = 0; Value = 18 }
                            @{ ID = 2; IsFlat = 0; Value = 12 }
                            @{ ID = 3; IsFlat = 1; Value = 520 }
                            @{ ID = 4; IsFlat = 0; Value = 15 }
                        )
                    }
                    @{
                        ArtifactType = 6
                        ArtifactSet  = 17
                        Rank         = 6
                        Rarity       = 6
                        Level        = 12
                        MainStatID   = 14
                        MainStatF    = 0
                        Faction      = 12
                        Substats     = @(
                            @{ ID = 7; IsFlat = 0; Value = 16 }
                            @{ ID = 9; IsFlat = 0; Value = 11 }
                            @{ ID = 10; IsFlat = 1; Value = 260 }
                            @{ ID = 11; IsFlat = 0; Value = 14 }
                        )
                    }
                )
            }
        }
        @{
            Label   = 'Savage nuker core'
            Factory = {
                @(
                    @{
                        ArtifactType = 1
                        ArtifactSet  = 11
                        Rank         = 6
                        Rarity       = 6
                        Level        = 16
                        MainStatID   = 5
                        MainStatF    = 0
                        Substats     = @(
                            @{ ID = 8; IsFlat = 0; Value = 15 }
                            @{ ID = 2; IsFlat = 0; Value = 12 }
                            @{ ID = 6; IsFlat = 0; Value = 20 }
                            @{ ID = 4; IsFlat = 0; Value = 10 }
                        )
                    }
                    @{
                        ArtifactType = 2
                        ArtifactSet  = 11
                        Rank         = 6
                        Rarity       = 5
                        Level        = 12
                        MainStatID   = 9
                        MainStatF    = 0
                        Substats     = @(
                            @{ ID = 1; IsFlat = 0; Value = 12 }
                            @{ ID = 6; IsFlat = 0; Value = 16 }
                            @{ ID = 7; IsFlat = 0; Value = 14 }
                            @{ ID = 3; IsFlat = 1; Value = 480 }
                        )
                    }
                )
            }
        }
        @{
            Label   = 'Support accessory trio'
            Factory = {
                @(
                    @{
                        ArtifactType = 7
                        ArtifactSet  = 20
                        Rank         = 6
                        Rarity       = 6
                        Level        = 16
                        MainStatID   = 18
                        MainStatF    = 0
                        Faction      = 2
                        Substats     = @(
                            @{ ID = 1; IsFlat = 0; Value = 12 }
                            @{ ID = 5; IsFlat = 0; Value = 14 }
                            @{ ID = 12; IsFlat = 0; Value = 15 }
                            @{ ID = 13; IsFlat = 1; Value = 380 }
                        )
                    }
                    @{
                        ArtifactType = 8
                        ArtifactSet  = 20
                        Rank         = 6
                        Rarity       = 5
                        Level        = 12
                        MainStatID   = 15
                        MainStatF    = 0
                        Faction      = 2
                        Substats     = @(
                            @{ ID = 7; IsFlat = 0; Value = 13 }
                            @{ ID = 9; IsFlat = 0; Value = 11 }
                            @{ ID = 16; IsFlat = 0; Value = 10 }
                            @{ ID = 3; IsFlat = 1; Value = 340 }
                        )
                    }
                    @{
                        ArtifactType = 9
                        ArtifactSet  = 0
                        Rank         = 6
                        Rarity       = 6
                        Level        = 16
                        MainStatID   = 19
                        MainStatF    = 0
                        Faction      = 2
                        Substats     = @(
                            @{ ID = 1; IsFlat = 0; Value = 10 }
                            @{ ID = 14; IsFlat = 0; Value = 12 }
                            @{ ID = 18; IsFlat = 0; Value = 15 }
                            @{ ID = 4; IsFlat = 0; Value = 9 }
                        )
                    }
                )
            }
        }
    )
    TesterSampleCursor  = 0
    SelectSampleIndices = @(10, 20, 30)
    SelectSampleCursor  = 0
}
#endregion

#region === Protocol helpers (copy-worthy) ===
function New-Utf8JsonBytes {
    <#
        .SYNOPSIS
        Serializes a PowerShell object to UTF-8 JSON. Used for all HTTP replies.
    #>
    param([Parameter(Mandatory = $true)] $InputObject)
    $json = $InputObject | ConvertTo-Json -Depth 20
    return [System.Text.Encoding]::UTF8.GetBytes($json)
}

function ConvertTo-HashtableStrict {
    <# Makes a shallow copy when the payload is a PSCustomObject/dictionary. #>
    param($Value)
    if ($null -eq $Value) { return $null }
    if ($Value -is [System.Collections.IDictionary]) {
        $copy = @{}
        foreach ($key in $Value.Keys) { $copy[$key] = $Value[$key] }
        return $copy
    }
    if ($Value -is [PSCustomObject]) {
        $copy = @{}
        foreach ($prop in $Value.PSObject.Properties) { $copy[$prop.Name] = $prop.Value }
        return $copy
    }
    return $null
}

function ConvertTo-HashtableArray {
    <# Normalizes enumerable payloads to an array of hashtables. #>
    param($Value)
    $results = @()
    if ($Value -is [System.Collections.IEnumerable]) {
        foreach ($item in $Value) {
            $entry = ConvertTo-HashtableStrict -Value $item
            if ($entry) { $results += $entry }
        }
    }
    return $results
}

function ConvertToNullableInt {
    param($Value)
    if ($null -eq $Value) { return $null }
    if ($Value -is [int]) { return $Value }
    if ($Value -is [long]) { return [int]$Value }
    $str = [string]$Value
    if ([string]::IsNullOrWhiteSpace($str)) { return $null }
    $parsed = 0
    if ([int]::TryParse($str, [ref]$parsed)) { return $parsed }
    return $null
}

function ConvertToNullableBool {
    param($Value)
    if ($Value -is [bool]) { return $Value }
    if ($Value -is [int]) { return ($Value -ne 0) }
    if ($Value -is [long]) { return ($Value -ne 0) }
    $str = [string]$Value
    if ([string]::IsNullOrWhiteSpace($str)) { return $null }
    switch ($str.Trim().ToLowerInvariant()) {
        '1' { return $true }
        'true' { return $true }
        'yes' { return $true }
        'on' { return $true }
        '0' { return $false }
        'false' { return $false }
        'no' { return $false }
        'off' { return $false }
    }
    return $null
}

#region === Console output helpers ===
$script:ConsoleUiState = [ordered]@{
    HeaderLines   = New-Object 'System.Collections.Generic.List[pscustomobject]'
    LogEntries    = New-Object 'System.Collections.Generic.List[pscustomobject]'
    MaxLogEntries = 300
    RenderLock    = New-Object object
    LastRenderLines = 0
}

function New-ConsoleLine {
    param(
        [Parameter(Mandatory = $true)][string]$Text,
        [ConsoleColor]$Color = [ConsoleColor]::Gray
    )

    return [pscustomobject]@{ Text = $Text; Color = $Color }
}

function Render-ConsoleUi {
    <#
        Redraws the pinned header plus the rolling log area in place.
    #>
    $state = $script:ConsoleUiState
    if (-not $state) { return }

    [System.Threading.Monitor]::Enter($state.RenderLock)
    try {
        [Console]::SetCursorPosition(0, 0)

        foreach ($line in $state.HeaderLines) {
            $previous = [Console]::ForegroundColor
            [Console]::ForegroundColor = $line.Color
            [Console]::WriteLine($line.Text)
            [Console]::ForegroundColor = $previous
        }

        if ($state.HeaderLines.Count -gt 0) {
            [Console]::WriteLine()
        }

        foreach ($entry in $state.LogEntries) {
            $previous = [Console]::ForegroundColor
            [Console]::ForegroundColor = $entry.Color
            [Console]::WriteLine($entry.Text)
            [Console]::ForegroundColor = $previous
        }

        $linesWritten = $state.HeaderLines.Count
        if ($state.HeaderLines.Count -gt 0) { $linesWritten++ }
        $linesWritten += $state.LogEntries.Count

        $bufferWidth = [Console]::BufferWidth
        if ($bufferWidth -lt 1) { $bufferWidth = 80 }
        $blankLine = ''.PadRight($bufferWidth)

        for ($i = $linesWritten; $i -lt $state.LastRenderLines; $i++) {
            [Console]::WriteLine($blankLine)
        }

        $state.LastRenderLines = $linesWritten

        $cursorTop = [Console]::CursorTop
        $cursorLeft = 0
        if ($cursorTop -ge [Console]::BufferHeight) {
            $cursorTop = [Console]::BufferHeight - 1
        }
        if ($cursorTop -lt 0) { $cursorTop = 0 }
        [Console]::SetCursorPosition($cursorLeft, $cursorTop)
    }
    finally {
        [System.Threading.Monitor]::Exit($state.RenderLock)
    }
}

function Write-ConsoleHeader {
    param(
        [Parameter(Mandatory = $true)][string[]]$Message,
        [ConsoleColor]$Color = [ConsoleColor]::Gray
    )

    $state = $script:ConsoleUiState
    foreach ($line in $Message) {
        $lineParts = $line -split "`r?`n"
        foreach ($part in $lineParts) {
            $state.HeaderLines.Add((New-ConsoleLine -Text $part -Color $Color)) | Out-Null
        }
    }

    Render-ConsoleUi
}

function Write-ConsoleLog {
    param(
        [Parameter(Mandatory = $true)][string[]]$Message,
        [ConsoleColor]$Color = [ConsoleColor]::Gray
    )

    $state = $script:ConsoleUiState
    foreach ($line in $Message) {
        $lineParts = $line -split "`r?`n"
        foreach ($part in $lineParts) {
            $state.LogEntries.Add((New-ConsoleLine -Text $part -Color $Color)) | Out-Null
        }
    }

    while ($state.LogEntries.Count -gt $state.MaxLogEntries) {
        $state.LogEntries.RemoveAt(0)
    }

    Render-ConsoleUi
}

function Write-HttpLog {
    param(
        [Parameter(Mandatory = $true)][ValidateSet('Inbound','Outbound')]$Direction,
        [Parameter(Mandatory = $true)][string]$Message
    )

    switch ($Direction) {
        'Inbound'  { Write-ConsoleLog -Message ("← $Message") -Color Cyan }
        'Outbound' { Write-ConsoleLog -Message ("→ $Message") -Color Magenta }
    }
}
#endregion

function Normalize-RuleIndex {
    <# Sample endpoints always return zero-based indexes. #>
    param($Value)
    $parsed = ConvertToNullableInt -Value $Value
    if ($null -eq $parsed) { return 0 }
    if ($parsed -lt 0) { return 0 }
    return [int]$parsed
}

function Get-EnumerableCount {
    param($Collection)
    if ($null -eq $Collection) { return 0 }
    if ($Collection -is [System.Collections.ICollection]) { return $Collection.Count }
    return 1
}

function Write-CorsHeaders {
    # Lightweight CORS response so the browser can POST straight to localhost.
    param([System.Net.HttpListenerResponse]$Response)
    $Response.AddHeader('Access-Control-Allow-Origin', '*')
    $Response.AddHeader('Access-Control-Allow-Methods', 'PUT, POST, GET, OPTIONS')
    $Response.AddHeader('Access-Control-Allow-Headers', 'content-type')
}

function Send-TextResponse {
    param(
        [System.Net.HttpListenerResponse]$Response,
        [int]$StatusCode,
        [string]$Message,
        [string]$ContentType = 'text/plain'
    )

    $Response.StatusCode = $StatusCode
    $Response.ContentType = $ContentType
    Write-CorsHeaders -Response $Response
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Message)
    $Response.ContentLength64 = $bytes.Length
    $Response.OutputStream.Write($bytes, 0, $bytes.Length)

    $bodyPreview = $Message
    if ($bodyPreview.Length -gt 400) {
        $bodyPreview = ($bodyPreview.Substring(0, 400) + '…')
    }
    Write-HttpLog -Direction Outbound -Message ("{0} {1} {2}" -f $StatusCode, $ContentType, $bodyPreview)
}

function Send-JsonResponse {
    param(
        [System.Net.HttpListenerResponse]$Response,
        [int]$StatusCode,
        $Payload
    )

    $bytes = New-Utf8JsonBytes -InputObject $Payload
    $Response.StatusCode = $StatusCode
    $Response.ContentType = 'application/json'
    Write-CorsHeaders -Response $Response
    $Response.ContentLength64 = $bytes.Length
    $Response.OutputStream.Write($bytes, 0, $bytes.Length)

    $preview = '{}'
    try {
        $preview = $Payload | ConvertTo-Json -Depth 10 -Compress
    } catch {
        $preview = '<failed to serialize preview>'
    }
    if ($preview.Length -gt 400) {
        $preview = ($preview.Substring(0, 400) + '…')
    }
    Write-HttpLog -Direction Outbound -Message ("{0} application/json {1}" -f $StatusCode, $preview)
}

function Read-JsonBody {
    # Parses the raw body exactly once. Caller decides which fields are relevant.
    param([System.Net.HttpListenerRequest]$Request)

    if (-not $Request.HasEntityBody) { return $null }

    $reader = New-Object System.IO.StreamReader -ArgumentList $Request.InputStream, $Request.ContentEncoding
    try {
        $body = $reader.ReadToEnd()
    }
    finally {
        $reader.Dispose()
    }

    if ([string]::IsNullOrWhiteSpace($body)) { return $null }

    $parsed = $body | ConvertFrom-Json -Depth 20

    $preview = $body
    try {
        $preview = $parsed | ConvertTo-Json -Depth 10 -Compress
    } catch {}
    if ($preview.Length -gt 400) {
        $preview = ($preview.Substring(0, 400) + '…')
    }
    Write-HttpLog -Direction Inbound -Message ("Body JSON $preview")

    return $parsed
}
#endregion

#region === Protocol queue helpers (copy-worthy) ===
function Add-ProtocolCommandEvent {
    <#
        Adds a command event to the queue consumed by `GET /commands`.
        The stored shape mirrors what the browser receives: `{ type, ...payload }`.
    #>
    param(
        [Parameter(Mandatory = $true)][string]$Type,
        [System.Collections.IDictionary]$Data
    )

    $protocol = $script:PushProtocolState
    $event = @{
        type     = $Type
        queuedAt = [DateTime]::UtcNow.ToString('o')
    }
    if ($Data) {
        foreach ($key in $Data.Keys) { $event[$key] = $Data[$key] }
    }

    [System.Threading.Monitor]::Enter($protocol.QueueLock)
    try {
        $protocol.CommandQueue.Add($event) | Out-Null
        if ($protocol.CommandQueue.Count -gt $protocol.MaxQueueLength) {
            $protocol.CommandQueue.RemoveAt(0)
        }
    }
    finally {
        [System.Threading.Monitor]::Exit($protocol.QueueLock)
    }

    return $event
}

function Drain-ProtocolCommandEvents {
    <# Returns queued events and clears the queue. #>

    $protocol = $script:PushProtocolState
    $results = @()
    [System.Threading.Monitor]::Enter($protocol.QueueLock)
    try {
        foreach ($evt in $protocol.CommandQueue) {
            $copy = @{}
            foreach ($key in $evt.Keys) { $copy[$key] = $evt[$key] }
            $results += $copy
        }
        $protocol.CommandQueue.Clear()
    }
    finally {
        [System.Threading.Monitor]::Exit($protocol.QueueLock)
    }

    return ,$results
}
#endregion

#region === Protocol HTTP handlers (copy-worthy) ===
function Get-NormalizedPath {
    param([System.Net.HttpListenerRequest]$Request)
    $normalizedPath = $Request.Url.AbsolutePath
    if (-not $normalizedPath) { $normalizedPath = '/' }
    if ($normalizedPath.Length -gt 1 -and $normalizedPath.EndsWith('/')) {
        $normalizedPath = $normalizedPath.TrimEnd('/')
    }
    return $normalizedPath.ToLowerInvariant()
}

function Invoke-UploadSellfile {
    <#
        Handles PUT / — the primary contract documented by this sample.
        Saves the raw `.hsf` JSON document that Sellfile Creator pushes.
        Example body: sample-upload-body.json
    #>
    param(
        [System.Net.HttpListenerContext]$Context,
        [string]$OutputPath,
        [bool]$OpenOnSave
    )

    $request = $Context.Request
    $response = $Context.Response

    $fileStream = [System.IO.File]::Open($OutputPath, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write, [System.IO.FileShare]::Read)
    try {
        $request.InputStream.CopyTo($fileStream)
    }
    finally {
        $fileStream.Dispose()
    }

    $fileSize = [System.IO.FileInfo]::new($OutputPath).Length
    Write-ConsoleLog -Message "Saved Sellfile payload ($fileSize bytes) to $OutputPath" -Color Green
    if ($OpenOnSave) {
        try {
            Start-Process $OutputPath | Out-Null
            Write-ConsoleLog -Message "Opened $OutputPath" -Color DarkGray
        } catch {
            Write-ConsoleLog -Message ("Failed to open {0}: {1}" -f $OutputPath, $_) -Color DarkYellow
        }
    }
    $response.StatusCode = 204
    Write-CorsHeaders -Response $response
    $response.ContentLength64 = 0

    Write-HttpLog -Direction Outbound -Message ("204 No Content ({0})" -f $request.RawUrl)

    return $true
}

function Invoke-GetCommands {
    <#
        Handles GET /commands — Sellfile Creator polls for queued events here.
        See sample-commands-response.json for shape.
    #>
    param(
        [System.Net.HttpListenerContext]$Context
    )

    $response = $Context.Response
    $events = Drain-ProtocolCommandEvents
    $count = $events.Length
    Send-JsonResponse -Response $response -StatusCode 200 -Payload @{ events = $events }
    if ($count -gt 0) {
        Write-ConsoleLog -Message "Served $count queued command(s)" -Color DarkGray
    }

    return $true
}

function Invoke-PostCommands {
    <#
        Handles POST /commands — optional helper to enqueue events manually.
        Payload matches the event shapes documented for GET /commands.
    #>
    param(
        [System.Net.HttpListenerContext]$Context
    )

    $request = $Context.Request
    $response = $Context.Response

    $deserialized = Read-JsonBody -Request $request
    $dict = ConvertTo-HashtableStrict -Value $deserialized
    if (-not $dict) {
        Send-TextResponse -Response $response -StatusCode 400 -Message 'Body must be a JSON object.'
        return $true
    }

    $typeKey = $null
    foreach ($candidate in $dict.Keys) {
        if ([string]::Equals($candidate, 'type', [System.StringComparison]::InvariantCultureIgnoreCase)) {
            $typeKey = $candidate
            break
        }
    }

    if (-not $typeKey) {
        Send-TextResponse -Response $response -StatusCode 400 -Message 'Missing "type" field.'
        return $true
    }

    $payloadTable = @{}
    foreach ($key in $dict.Keys) {
        if ($key -ne $typeKey) { $payloadTable[$key] = $dict[$key] }
    }

    $event = Add-ProtocolCommandEvent -Type ([string]$dict[$typeKey]) -Data $payloadTable
    Send-JsonResponse -Response $response -StatusCode 202 -Payload @{ status = 'queued' }
    Write-ConsoleLog -Message "Queued mock command event: type=$($event.type)" -Color DarkGray
    return $true
}

function Write-ProtocolQuickReference {
    <#
        Prints a terse cheatsheet so developers can see the required endpoints
        without reading the entire file.
    #>
    $paths = $script:PushProtocolReference.Paths
    Write-ConsoleHeader -Message '--- Sellfile push protocol quick reference ---' -Color DarkCyan
    Write-ConsoleHeader -Message (
        "PUT {0} → save raw .hsf JSON; reply 204 No Content" -f $paths.UploadSellfile.Path
    ) -Color DarkGray
    Write-ConsoleHeader -Message (
        "GET {0} → returns {{ events }}" -f $paths.PollCommands.Path
    ) -Color DarkGray
    Write-ConsoleHeader -Message '    • selectRule event: { type, ruleIndex, ruleId? }' -Color DarkGray
    Write-ConsoleHeader -Message '    • testerItems event: { type, items[], openTester }' -Color DarkGray
    Write-ConsoleHeader -Message (
        "POST {0} → optional helper to enqueue events manually" -f $paths.QueueCommands.Path
    ) -Color DarkGray
    Write-ConsoleHeader -Message 'OPTIONS (any path) → respond 204 with CORS headers' -Color DarkGray
}

function Handle-ProtocolRequest {
    <#
        Handles the endpoints that the real push listener is expected to expose.
        Returns $true when the request has been handled.
    #>
    param(
        [System.Net.HttpListenerContext]$Context,
        [string]$OutputPath,
        [bool]$OpenOnSave
    )

    $request = $Context.Request
    $response = $Context.Response

    if ($request.HttpMethod -eq 'OPTIONS') {
        # Browser CORS preflight — respond with permissive headers.
        $response.StatusCode = 204
        Write-CorsHeaders -Response $response
        $response.ContentLength64 = 0
        Write-ConsoleLog -Message 'Handled CORS preflight' -Color DarkGray
        Write-HttpLog -Direction Outbound -Message ("204 No Content ({0})" -f $request.RawUrl)
        return $true
    }

    $pathLower = Get-NormalizedPath -Request $request

    switch ($request.HttpMethod.ToUpperInvariant()) {
        'GET' {
            if ($pathLower -eq $PushProtocolCommandsPath) {
                return (Invoke-GetCommands -Context $Context)
            }
        }
        'POST' {
            if ($pathLower -eq $PushProtocolCommandsPath) {
                return (Invoke-PostCommands -Context $Context)
            }
        }
        'PUT' {
            if ($pathLower -eq $PushProtocolUploadPath) {
                return (Invoke-UploadSellfile -Context $Context -OutputPath $OutputPath -OpenOnSave:$OpenOnSave)
            }
        }
    }

    return $false
}
#endregion

#region === Demo HTTP handlers (optional helpers) ===
function Handle-DemoRequest {
    <#
        Handles the endpoints that only exist in the sample harness.
        They demonstrate the payload shapes that the helper could emit.
        Returns $true when the request has been handled.
    #>
    param(
        [System.Net.HttpListenerContext]$Context
    )

    $request = $Context.Request
    $response = $Context.Response
    $pathLower = Get-NormalizedPath -Request $request

    if ($request.HttpMethod -eq 'POST' -and $pathLower -eq '/mock/select') {
        $bodyObj = Read-JsonBody -Request $request
        $bodyDict = ConvertTo-HashtableStrict -Value $bodyObj

        $ruleIndexValue = ConvertToNullableInt -Value $request.QueryString['index']
        if ($null -eq $ruleIndexValue -and $bodyDict -and $bodyDict.ContainsKey('ruleIndex')) {
            $ruleIndexValue = ConvertToNullableInt -Value $bodyDict['ruleIndex']
        }

        $sampleMeta = $null
        if ($null -eq $ruleIndexValue) {
            $sampleMeta = Get-NextSelectSample
            $ruleIndexNormalized = Normalize-RuleIndex -Value ([Math]::Max(0, $sampleMeta.Index - 1))
        } else {
            $ruleIndexNormalized = Normalize-RuleIndex -Value ($ruleIndexValue - 1)
        }

        $ruleId = $request.QueryString['ruleId']
        if (-not $ruleId -and $bodyDict -and $bodyDict.ContainsKey('ruleId')) {
            $ruleId = [string]$bodyDict['ruleId']
        }

        $payloadTable = @{
            ruleIndex = $ruleIndexNormalized
        }
        if ($ruleId) { $payloadTable['ruleId'] = $ruleId }

        $event = Add-ProtocolCommandEvent -Type 'selectRule' -Data $payloadTable
        $responsePayload = @{ status = 'queued'; ruleIndex = $ruleIndexNormalized }
        if ($sampleMeta) {
            $responsePayload['sample'] = @{ rotation = $sampleMeta.Rotation; row = $sampleMeta.Index; ruleIndex = $ruleIndexNormalized }
        }
        Send-JsonResponse -Response $response -StatusCode 202 -Payload $responsePayload
        if ($sampleMeta) {
            Write-ConsoleLog -Message (
                "Queued mock selectRule event ruleIndex=$ruleIndexNormalized (sample rotation #$($sampleMeta.Rotation))"
            ) -Color DarkGray
        } else {
            Write-ConsoleLog -Message "Queued mock selectRule event ruleIndex=$ruleIndexNormalized" -Color DarkGray
        }
        return $true
    }

    if ($request.HttpMethod -eq 'POST' -and $pathLower -eq '/mock/tester-items') {
        $bodyObj = Read-JsonBody -Request $request
        $bodyDict = ConvertTo-HashtableStrict -Value $bodyObj

        $itemsSource = $null
        if ($bodyDict -and $bodyDict.ContainsKey('items')) {
            $itemsSource = $bodyDict['items']
        } elseif ($bodyObj -is [System.Collections.IEnumerable]) {
            $itemsSource = $bodyObj
        }

        $items = ConvertTo-HashtableArray -Value $itemsSource
        $sampleMeta = $null
        if (-not $items -or (Get-EnumerableCount $items) -eq 0) {
            $sampleMeta = Get-NextTesterSample
            $items = $sampleMeta.Items
        }

        $openFlag = ConvertToNullableBool -Value $request.QueryString['openTester']
        if ($null -eq $openFlag -and $bodyDict -and $bodyDict.ContainsKey('openTester')) {
            $openFlag = ConvertToNullableBool -Value $bodyDict['openTester']
        }
        if ($null -eq $openFlag) { $openFlag = $true }

        $payloadTable = @{
            items      = $items
            openTester = [bool]$openFlag
        }

        $event = Add-ProtocolCommandEvent -Type 'testerItems' -Data $payloadTable
        $itemCount = Get-EnumerableCount $items
        $responsePayload = @{ status = 'queued'; items = $itemCount }
        if ($sampleMeta) {
            $responsePayload['sample'] = @{ index = $sampleMeta.Index; label = $sampleMeta.Label }
        }
        Send-JsonResponse -Response $response -StatusCode 202 -Payload $responsePayload
        if ($sampleMeta) {
            Write-ConsoleLog -Message (
                "Queued mock testerItems event count=$itemCount (sample ##$($sampleMeta.Index) $($sampleMeta.Label))"
            ) -Color DarkGray
        } else {
            Write-ConsoleLog -Message "Queued mock testerItems event count=$itemCount" -Color DarkGray
        }
        return $true
    }

    return $false
}
#endregion

#region === Demo sample helpers (optional) ===
function Get-NextTesterSample {
    $state = $script:DemoState
    $factories = $state.TesterSampleFactories
    if ($factories.Count -eq 0) {
        return [PSCustomObject]@{ Index = 1; Label = 'sample'; Items = @() }
    }

    $current = $state.TesterSampleCursor
    $definition = $factories[$current]
    $state.TesterSampleCursor = ($current + 1) % $factories.Count
    $items = & $definition.Factory
    return [PSCustomObject]@{
        Index = $current + 1
        Label = [string]$definition.Label
        Items = $items
    }
}

function Get-NextSelectSample {
    $state = $script:DemoState
    $indices = $state.SelectSampleIndices
    if ($indices.Count -eq 0) {
        return @{ Rotation = 1; Index = 0 }
    }

    $current = $state.SelectSampleCursor
    $value = $indices[$current]
    $state.SelectSampleCursor = ($current + 1) % $indices.Count
    return @{ Rotation = $current + 1; Index = $value }
}

function Queue-SampleTesterItems {
    $sample = Get-NextTesterSample
    $payload = @{
        items      = $sample.Items
        openTester = $true
    }
    $count = Get-EnumerableCount $sample.Items
    $event = Add-ProtocolCommandEvent -Type 'testerItems' -Data $payload
    Write-ConsoleLog -Message (
        "Shortcut queued testerItems sample ##$($sample.Index) ($($sample.Label)) → $count item(s)"
    ) -Color DarkGray
    return $event
}

function Queue-SampleSelectRule {
    $sample = Get-NextSelectSample
    $zeroBasedIndex = [Math]::Max(0, $sample.Index - 1)
    $payload = @{
        ruleIndex = $zeroBasedIndex
    }
    $event = Add-ProtocolCommandEvent -Type 'selectRule' -Data $payload
    Write-ConsoleLog -Message (
        "Shortcut queued selectRule sample ##$($sample.Rotation) → row $($sample.Index)"
    ) -Color DarkGray
    return $event
}

function Poll-ShortcutInput {
    <#
        Allows the demo operator to enqueue sample events with the keyboard.
        A production listener would queue events directly in response to game
        state changes; this helper just wires in a few shortcuts.
    #>
    param([System.Threading.CancellationTokenSource]$TokenSource)

    $handled = $false
    while ([System.Console]::KeyAvailable) {
        $handled = $true
        $keyInfo = [System.Console]::ReadKey($true)
        $modifiers = $keyInfo.Modifiers
        if ((($modifiers -band [System.ConsoleModifiers]::Control) -ne 0) -and $keyInfo.Key -eq [System.ConsoleKey]::C) {
            Write-ConsoleLog -Message 'Shortcut loop observed Ctrl+C; requesting shutdown.' -Color DarkGray
            try { $TokenSource.Cancel() } catch {}
            return $true
        }

        switch ($keyInfo.Key) {
            ([System.ConsoleKey]::T) {
                Write-ConsoleLog -Message 'Shortcut detected: T' -Color DarkGray
                [void](Queue-SampleTesterItems)
                continue
            }
            ([System.ConsoleKey]::R) {
                Write-ConsoleLog -Message 'Shortcut detected: R' -Color DarkGray
                [void](Queue-SampleSelectRule)
                continue
            }
            default { continue }
        }
    }

    return $handled
}
#endregion

#region === Launch helpers (demo-only) ===
function Resolve-AppEntryPath {
    param([string]$Root)

    $candidates = @(
        (Join-Path $Root 'SellfileCreator.html'),
        (Join-Path $Root 'dist\SellfileCreator.html'),
        (Join-Path $Root 'dist\index.html'),
        (Join-Path $Root 'index.html')
    )

    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) {
            return (Resolve-Path $candidate).Path
        }
    }

    $message = @(
        "Sellfile entry point not found under '$Root'.",
        "Expected one of: SellfileCreator.html, dist\\SellfileCreator.html, dist\\index.html, index.html.",
        "Run 'npm run build' first or pass -AppRoot explicitly."
    ) -join ' '
    throw $message
}

function New-LaunchUrl {
    param(
        [string]$IndexPath,
        [string]$Endpoint
    )

    $indexUri = New-Object System.Uri -ArgumentList $IndexPath
    $encoded = [System.Uri]::EscapeDataString($Endpoint)
    return ($indexUri.AbsoluteUri + "?push=$encoded")
}

function Get-DefaultHtmlHandlerExe {
    # Attempts to find the default browser executable so query params survive.
    $progid = $null
    $candidates = @(
        'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.html\UserChoice',
        'HKCU:\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\http\UserChoice',
        'HKCU:\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\https\UserChoice'
    )
    foreach ($path in $candidates) {
        try {
            $props = Get-ItemProperty -Path $path -ErrorAction Stop
            if ($props.ProgId) {
                $progid = $props.ProgId
                break
            }
        } catch {}
    }

    if (-not $progid) { return $null }

    $commandKey = "Registry::HKEY_CLASSES_ROOT\\$progid\\shell\\open\\command"
    $command = (Get-ItemProperty -Path $commandKey -ErrorAction SilentlyContinue).'(Default)'
    if (-not $command) { return $null }

    if ($command -match '^\s*"?([^"]+\.exe)"?') { return $matches[1] }
    return $null
}

function Open-LaunchUrl {
    param([string]$Url)

    $browserExe = $null
    try { $browserExe = Get-DefaultHtmlHandlerExe } catch {}

    if ($browserExe) {
        try {
            Start-Process -FilePath $browserExe -ArgumentList $Url | Out-Null
            return $true
        } catch {
            Write-ConsoleLog -Message ("Failed to launch {0} via {1}: {2}" -f $Url, $browserExe, $_) -Color DarkYellow
        }
    }

    try {
        $psi = New-Object System.Diagnostics.ProcessStartInfo
        $psi.FileName = $Url
        $psi.UseShellExecute = $true
        [System.Diagnostics.Process]::Start($psi) | Out-Null
        return $true
    }
    catch {
        try {
            Start-Process -FilePath $Url | Out-Null
            return $true
        } catch {
            Write-ConsoleLog -Message ("Failed to launch URL {0}: {1}" -f $Url, $_) -Color DarkYellow
        }
    }

    return $false
}
#endregion

#region === Central request dispatcher ===
function Handle-IncomingRequest {
    param(
        [System.Net.HttpListenerContext]$Context,
        [string]$OutputPath,
        [bool]$OpenOnSave
    )

    $request = $Context.Request
    $response = $Context.Response

    $lengthSuffix = ''
    if ($request.ContentLength64 -gt 0) {
        $lengthSuffix = " ($($request.ContentLength64) bytes)"
    }
    Write-HttpLog -Direction Inbound -Message ("{0} {1}{2}" -f $request.HttpMethod, $request.RawUrl, $lengthSuffix)

    try {
        if (Handle-ProtocolRequest -Context $Context -OutputPath $OutputPath -OpenOnSave:$OpenOnSave) {
            return
        }

        if (Handle-DemoRequest -Context $Context) {
            return
        }

        Send-TextResponse -Response $response -StatusCode 405 -Message 'Only PUT, GET, and POST are supported on this service.'
        Write-ConsoleLog -Message "Received unsupported $($request.HttpMethod) request" -Color DarkYellow
    }
    catch {
        Write-ConsoleLog -Message ("Failed to handle request: $_") -Color DarkYellow
        try {
            $response.StatusCode = 500
            $response.StatusDescription = 'Internal Server Error'
            Write-CorsHeaders -Response $response
        } catch {}
    }
    finally {
        try { $response.OutputStream.Close() } catch {}
        try { $response.Close() } catch {}
        if ($request.InputStream) { $request.InputStream.Dispose() }
    }
}
#endregion

#region === Runtime setup & listener loop ===
$indexPathResolved = Resolve-AppEntryPath -Root $AppRoot
$endpoint = "http://localhost:$Port/"
$launchUrl = New-LaunchUrl -IndexPath $indexPathResolved -Endpoint $endpoint

Write-ConsoleHeader -Message "Launching Sellfile Creator with push endpoint $endpoint" -Color Cyan
Write-ConsoleHeader -Message "Launch URL: $launchUrl" -Color DarkGray
Write-ProtocolQuickReference

if (-not (Open-LaunchUrl -Url $launchUrl)) {
    Write-Error "Failed to launch $launchUrl"
}

if ($LaunchOnly) {
    return
}

$listener = New-Object System.Net.HttpListener
$stopSource = [System.Threading.CancellationTokenSource]::new()
$cancelHandler = [System.ConsoleCancelEventHandler]{
    param($sender, $args)
    $args.Cancel = $true
    if (-not $stopSource.IsCancellationRequested) {
        $stopSource.Cancel()
        try {
            if ($listener -and $listener.IsListening) { $listener.Stop() }
        } catch {}
    }
}

$prefix = $endpoint
$listener.Prefixes.Add($prefix)
try {
    $listener.Start()
    Write-ConsoleHeader -Message "Sample push server listening on $prefix" -Color Yellow
    Write-ConsoleHeader -Message "Inbound PUT bodies will be saved to $OutputPath" -Color Yellow
    Write-ConsoleHeader -Message 'Press Ctrl+C to stop the listener.' -Color DarkGray

    try { [System.Console]::CancelKeyPress += $cancelHandler } catch {}

    $outputDir = Split-Path -Parent $OutputPath
    if ($outputDir -and -not (Test-Path $outputDir)) {
        New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
    }

    Write-ConsoleHeader -Message 'Shortcuts: [T] queue sample tester items, [R] queue sample selectRule.' -Color DarkGray

    $pendingContext = $null
    $contextWaitHandle = $null
    try {
        $pendingContext = $listener.BeginGetContext($null, $null)
        $contextWaitHandle = $pendingContext.AsyncWaitHandle
    } catch {
        Write-ConsoleLog -Message ("Failed to start listener accept loop: $_") -Color DarkYellow
        throw
    }

    while (-not $stopSource.IsCancellationRequested) {
        Poll-ShortcutInput -TokenSource $stopSource | Out-Null
        if ($stopSource.IsCancellationRequested) { break }

        $signaled = $false
        try {
            $signaled = $contextWaitHandle.WaitOne(50)
        }
        catch [System.ObjectDisposedException] { break }

        if (-not $signaled) { continue }

        $context = $null
        try {
            $context = $listener.EndGetContext($pendingContext)
        }
        catch [System.Net.HttpListenerException] {
            if ($stopSource.IsCancellationRequested) { break }
            Write-ConsoleLog -Message ("Listener aborted: $_") -Color DarkYellow
            break
        }
        catch [System.ObjectDisposedException] { break }
        catch {
            Write-ConsoleLog -Message ("Listener aborted: $_") -Color DarkYellow
            break
        }

        if ($context) {
            Handle-IncomingRequest -Context $context -OutputPath $OutputPath -OpenOnSave:$OpenOnSave
        }

        if ($stopSource.IsCancellationRequested -or -not $listener.IsListening) { break }

        try { $contextWaitHandle.Close() } catch {}
        try {
            $pendingContext = $listener.BeginGetContext($null, $null)
            $contextWaitHandle = $pendingContext.AsyncWaitHandle
        }
        catch [System.ObjectDisposedException] { break }
        catch [System.Net.HttpListenerException] {
            if ($stopSource.IsCancellationRequested) { break }
            Write-ConsoleLog -Message ("Listener aborted: $_") -Color DarkYellow
            break
        }
    }

    try { $contextWaitHandle?.Close() } catch {}
}
finally {
    try { [System.Console]::CancelKeyPress -= $cancelHandler } catch {}
    if (-not $stopSource.IsCancellationRequested) {
        try { $stopSource.Cancel() } catch {}
    }
    if ($listener.IsListening) { $listener.Stop() }
    $listener.Close()
    $stopSource.Dispose()
    Write-ConsoleLog -Message 'Mock listener stopped.' -Color DarkGray
}
#endregion
