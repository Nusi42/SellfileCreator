<#!
.SYNOPSIS
Provides a heavily-commented sample service that mimics the Sellfile push
contract expected by RSL Helper.

.DESCRIPTION
The goal of this script is twofold:
1. Demonstrate the minimal HTTP surface that RSL Helper needs to implement so
   Sellfile Creator can push `.hsf` payloads and poll for out-of-band commands.
2. Offer a self-contained demo harness (keyboard shortcuts, canned payloads,
   safety rails) so contributors can experiment without touching the real
   helper.

The script therefore separates the **protocol sample** from the **demo-only
scaffolding**. RSL Helper integrators can focus on the "Protocol" sections and
ignore the rest.
#>
[CmdletBinding()]
param(
    [int]$Port = 4242,
    [string]$AppRoot = (Join-Path (Split-Path -Parent $PSScriptRoot) 'dist'),
    [string]$OutputPath = (Join-Path $PSScriptRoot 'mock-export.hsf'),
    [switch]$LaunchOnly,
    [switch]$OpenOnSave,
    [Parameter(DontShow = $true)]
    [switch]$SkipRelaunch
)

Set-StrictMode -Version Latest

#region === Protocol quick reference (copy-worthy) ===
# RSL Helper developers only need to implement the endpoints described here.
# The remainder of this script adds demo conveniences around the protocol.
$script:PushProtocolReference = [ordered]@{
    EndpointSummary = 'Sellfile Creator pushes to http://localhost:<port>/'
    Paths = [ordered]@{
        UploadSellfile = [ordered]@{
            Method        = 'PUT'
            Path          = '/'
            RequestBody   = 'Raw .hsf JSON produced by Sellfile Creator. The helper must persist these bytes as-is.'
            ContentType   = 'application/json; charset=utf-8'
            Response      = '204 No Content + CORS headers. Do not mutate the payload.'
        }
        PollCommands = [ordered]@{
            Method        = 'GET'
            Path          = '/commands'
            Query         = 'Optional ?since=<lastId>. Defaults to 0 when omitted.'
            ResponseShape = '{ "events": CommandEvent[], "lastId": number }'
            Events        = @(
                'selectRule → { id, type: "selectRule", ruleIndex, ruleId?, source? }',
                'testerItems → { id, type: "testerItems", items: ArtifactSummary[], openTester, source? }'
            )
        }
        QueueCommands = [ordered]@{
            Method      = 'POST'
            Path        = '/commands'
            Role        = 'Optional helper for diagnostics; mirrors what GET /commands exposes.'
            RequestBody = 'JSON object { type: string, ...payload } forwarded to the queue.'
            Response    = '202 Accepted with the queued id. Not required in production.'
        }
        Preflight = [ordered]@{
            Method   = 'OPTIONS'
            Path     = 'Any of the above'
            Response = '204 No Content with permissive CORS headers.'
        }
    }
}

# Constants keep the copy-worthy protocol values in one place so the demo-only
# sections cannot accidentally disagree.
Set-Variable -Name 'PushProtocolUploadPath' -Option Constant -Value '/'
Set-Variable -Name 'PushProtocolCommandsPath' -Option Constant -Value '/commands'
#endregion

#region === PowerShell host bootstrap (demo-only) ===
# Sellfile Creator ships with a ps1 wrapper so contributors can double-click it
# on Windows. We politely re-launch under PowerShell 7 (`pwsh`) because the HTTP
# APIs we rely on are only available there. RSL Helper can ignore this section
# and host the HTTP listener inside its own process.
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
#endregion

Add-Type -AssemblyName System.Net.HttpListener -ErrorAction SilentlyContinue | Out-Null

#region === Protocol state (copy-worthy) ===
# Everything in this region demonstrates the state RSL Helper needs to keep for
# the wire protocol. The queue is intentionally tiny and uses plain hashtables
# so the shapes are easy to inspect in the console.
$script:PushProtocolState = [ordered]@{
    CommandQueue   = New-Object 'System.Collections.Generic.List[Hashtable]'
    QueueLock      = New-Object object
    NextCommandId  = 1
    LastZeroPoll   = [DateTime]::MinValue
    MaxQueueLength = 200
}
#endregion

#region === Demo harness state (optional) ===
# The harness below supplies keyboard shortcuts and canned payloads so we can
# emulate what a helper might emit. None of this is required for the real
# integration.
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

function Normalize-RuleIndex {
    <# RSL Helper should always respond with zero-based indexes. #>
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
    return $body | ConvertFrom-Json -Depth 20
}
#endregion

#region === Protocol queue helpers (copy-worthy) ===
function Add-ProtocolCommandEvent {
    <#
        Adds a command event to the queue consumed by `GET /commands`.
        RSL Helper would push events here whenever it wants the UI to react
        (e.g., highlight a rule or feed tester items). The stored shape mirrors
        what the browser receives: `{ id, type, timestamp, ...payload }`.
    #>
    param(
        [Parameter(Mandatory = $true)][string]$Type,
        [System.Collections.IDictionary]$Data
    )

    $protocol = $script:PushProtocolState
    $event = $null
    [System.Threading.Monitor]::Enter($protocol.QueueLock)
    try {
        $event = @{
            id        = $protocol.NextCommandId
            type      = $Type
            timestamp = [DateTime]::UtcNow.ToString('o')
        }
        $protocol.NextCommandId += 1

        if ($Data) {
            foreach ($key in $Data.Keys) { $event[$key] = $Data[$key] }
        }

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

function Get-ProtocolCommandEvents {
    <# Returns a copy of the events added after the given id. #>
    param([int]$SinceId)

    $protocol = $script:PushProtocolState
    $results = @()
    [System.Threading.Monitor]::Enter($protocol.QueueLock)
    try {
        foreach ($evt in $protocol.CommandQueue) {
            $currentId = 0
            if ($evt.ContainsKey('id')) { $currentId = [int]$evt['id'] }
            if ($currentId -gt $SinceId) {
                $copy = @{}
                foreach ($key in $evt.Keys) { $copy[$key] = $evt[$key] }
                $results += $copy
            }
        }
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
        Handles PUT / — the primary contract RSL Helper must support.
        Saves the raw `.hsf` JSON document that Sellfile Creator pushes.
        Example request body (truncated):
            {
              "metadata": { ... },
              "rules": [ ... ]
            }
    #>
    param(
        [System.Net.HttpListenerContext]$Context,
        [string]$OutputPath,
        [bool]$OpenOnSave
    )

    $request = $Context.Request
    $response = $Context.Response

    $memoryStream = New-Object System.IO.MemoryStream
    try {
        $buffer = New-Object byte[] 8192
        while ($true) {
            $read = $request.InputStream.Read($buffer, 0, $buffer.Length)
            if ($read -le 0) { break }
            $memoryStream.Write($buffer, 0, $read)
        }
        $bytes = $memoryStream.ToArray()
        [System.IO.File]::WriteAllBytes($OutputPath, $bytes)
        Write-Host "Saved Sellfile payload ($($bytes.Length) bytes) to $OutputPath" -ForegroundColor Green
        if ($OpenOnSave) {
            try {
                Start-Process $OutputPath | Out-Null
                Write-Host "Opened $OutputPath" -ForegroundColor DarkGray
            } catch {
                Write-Warning ("Failed to open {0}: {1}" -f $OutputPath, $_)
            }
        }
        $response.StatusCode = 204
        Write-CorsHeaders -Response $response
        $response.ContentLength64 = 0
    }
    finally {
        $memoryStream.Dispose()
    }

    return $true
}

function Invoke-GetCommands {
    <#
        Handles GET /commands — Sellfile Creator polls for queued events here.
        Example response when two events are queued:
            {
              "events": [
                { "id": 1, "type": "selectRule", "ruleIndex": 0 },
                { "id": 2, "type": "testerItems", "items": [ ... ], "openTester": true }
              ],
              "lastId": 2
            }
    #>
    param(
        [System.Net.HttpListenerContext]$Context
    )

    $request = $Context.Request
    $response = $Context.Response

    $sinceValue = 0
    $sinceParam = $request.QueryString['since']
    if ($sinceParam) { [int]::TryParse($sinceParam, [ref]$sinceValue) | Out-Null }

    $events = Get-ProtocolCommandEvents -SinceId $sinceValue
    $lastId = $sinceValue
    if ($events.Length -gt 0) {
        $lastEvent = $events[$events.Length - 1]
        if ($lastEvent -and $lastEvent.ContainsKey('id')) {
            $lastId = [int]$lastEvent['id']
        }
    }

    Send-JsonResponse -Response $response -StatusCode 200 -Payload @{ events = $events; lastId = $lastId }
    if ($events.Length -gt 0) {
        Write-Host "Served $($events.Length) queued command(s)" -ForegroundColor DarkGray
    } else {
        $now = Get-Date
        $protocol = $script:PushProtocolState
        if (($now - $protocol.LastZeroPoll).TotalSeconds -ge 5) {
            Write-Host 'Polling heartbeat (0 commands)' -ForegroundColor DarkGray
            $protocol.LastZeroPoll = $now
        }
    }

    return $true
}

function Invoke-PostCommands {
    <#
        Handles POST /commands — optional helper to enqueue events manually.
        Example request body:
            { "type": "selectRule", "ruleIndex": 5 }
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
    Send-JsonResponse -Response $response -StatusCode 202 -Payload @{ status = 'queued'; id = $event.id }
    Write-Host "Queued mock command event: type=$($event.type) id=$($event.id)" -ForegroundColor DarkGray
    return $true
}

function Write-ProtocolQuickReference {
    <#
        Prints a terse cheatsheet so developers can see the required endpoints
        without reading the entire file.
    #>
    $paths = $script:PushProtocolReference.Paths
    Write-Host '--- Sellfile push protocol quick reference ---' -ForegroundColor DarkCyan
    Write-Host ("PUT {0} → save raw .hsf JSON; reply 204 No Content" -f $paths.UploadSellfile.Path) -ForegroundColor DarkGray
    Write-Host ("GET {0}?since=<id> → returns {{ events, lastId }}" -f $paths.PollCommands.Path) -ForegroundColor DarkGray
    Write-Host '    • selectRule event: { id, type, ruleIndex, ruleId?, source? }' -ForegroundColor DarkGray
    Write-Host '    • testerItems event: { id, type, items[], openTester, source? }' -ForegroundColor DarkGray
    Write-Host ("POST {0} → optional helper to enqueue events manually" -f $paths.QueueCommands.Path) -ForegroundColor DarkGray
    Write-Host 'OPTIONS (any path) → respond 204 with CORS headers' -ForegroundColor DarkGray
}

function Handle-ProtocolRequest {
    <#
        Handles the endpoints that RSL Helper is expected to expose.
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
        Write-Host 'Handled CORS preflight' -ForegroundColor DarkGray
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

        $source = $request.QueryString['source']
        if (-not $source -and $bodyDict -and $bodyDict.ContainsKey('source')) {
            $source = [string]$bodyDict['source']
        }

        $payloadTable = @{
            ruleIndex = $ruleIndexNormalized
        }
        if ($ruleId) { $payloadTable['ruleId'] = $ruleId }
        if ($source) { $payloadTable['source'] = $source }

        $event = Add-ProtocolCommandEvent -Type 'selectRule' -Data $payloadTable
        $responsePayload = @{ status = 'queued'; id = $event.id; ruleIndex = $ruleIndexNormalized }
        if ($sampleMeta) {
            $responsePayload['sample'] = @{ rotation = $sampleMeta.Rotation; row = $sampleMeta.Index; ruleIndex = $ruleIndexNormalized }
        }
        Send-JsonResponse -Response $response -StatusCode 202 -Payload $responsePayload
        if ($sampleMeta) {
            Write-Host ("Queued mock selectRule event id=$($event.id) ruleIndex=$ruleIndexNormalized (sample rotation #$($sampleMeta.Rotation))") -ForegroundColor DarkGray
        } else {
            Write-Host "Queued mock selectRule event id=$($event.id) ruleIndex=$ruleIndexNormalized" -ForegroundColor DarkGray
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

        $source = $request.QueryString['source']
        if (-not $source -and $bodyDict -and $bodyDict.ContainsKey('source')) {
            $source = [string]$bodyDict['source']
        }

        $payloadTable = @{
            items      = $items
            openTester = [bool]$openFlag
        }
        if ($source) { $payloadTable['source'] = $source }

        $event = Add-ProtocolCommandEvent -Type 'testerItems' -Data $payloadTable
        $itemCount = Get-EnumerableCount $items
        $responsePayload = @{ status = 'queued'; id = $event.id; items = $itemCount }
        if ($sampleMeta) {
            $responsePayload['sample'] = @{ index = $sampleMeta.Index; label = $sampleMeta.Label }
        }
        Send-JsonResponse -Response $response -StatusCode 202 -Payload $responsePayload
        if ($sampleMeta) {
            Write-Host ("Queued mock testerItems event id=$($event.id) count=$itemCount (sample ##$($sampleMeta.Index) $($sampleMeta.Label))") -ForegroundColor DarkGray
        } else {
            Write-Host "Queued mock testerItems event id=$($event.id) count=$itemCount" -ForegroundColor DarkGray
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
    param([string]$Source = 'shortcut')
    $sample = Get-NextTesterSample
    $payload = @{
        items      = $sample.Items
        openTester = $true
    }
    if ($Source) { $payload['source'] = $Source }
    $event = Add-ProtocolCommandEvent -Type 'testerItems' -Data $payload
    $count = Get-EnumerableCount $sample.Items
    Write-Host ("Shortcut queued testerItems sample ##$($sample.Index) ($($sample.Label)) → $count item(s) (event id=$($event.id))") -ForegroundColor DarkGray
    return $event
}

function Queue-SampleSelectRule {
    param([string]$Source = 'shortcut')
    $sample = Get-NextSelectSample
    $zeroBasedIndex = [Math]::Max(0, $sample.Index - 1)
    $payload = @{
        ruleIndex = $zeroBasedIndex
    }
    if ($Source) { $payload['source'] = $Source }
    $event = Add-ProtocolCommandEvent -Type 'selectRule' -Data $payload
    Write-Host ("Shortcut queued selectRule sample ##$($sample.Rotation) → row $($sample.Index) (event id=$($event.id))") -ForegroundColor DarkGray
    return $event
}

function Poll-ShortcutInput {
    <#
        Allows the demo operator to enqueue sample events with the keyboard.
        RSL Helper has no need for this logic; real implementations would queue
        events directly in response to game state changes.
    #>
    param([System.Threading.CancellationTokenSource]$TokenSource)

    $handled = $false
    while ([System.Console]::KeyAvailable) {
        $handled = $true
        $keyInfo = [System.Console]::ReadKey($true)
        $modifiers = $keyInfo.Modifiers
        if ((($modifiers -band [System.ConsoleModifiers]::Control) -ne 0) -and $keyInfo.Key -eq [System.ConsoleKey]::C) {
            Write-Host 'Shortcut loop observed Ctrl+C; requesting shutdown.' -ForegroundColor DarkGray
            try { $TokenSource.Cancel() } catch {}
            return $true
        }

        switch ($keyInfo.Key) {
            ([System.ConsoleKey]::T) {
                Write-Host 'Shortcut detected: T' -ForegroundColor DarkGray
                [void](Queue-SampleTesterItems -Source 'shortcut')
                continue
            }
            ([System.ConsoleKey]::R) {
                Write-Host 'Shortcut detected: R' -ForegroundColor DarkGray
                [void](Queue-SampleSelectRule -Source 'shortcut')
                continue
            }
            default { continue }
        }
    }

    return $handled
}
#endregion

#region === Launch helpers (demo-only) ===
function Ensure-AppRoot {
    param([string]$Root)
    $indexPath = Join-Path $Root 'index.html'
    if (-not (Test-Path $indexPath)) {
        throw "index.html not found at $indexPath. Run 'npm run build' first or adjust -AppRoot."
    }
    return (Resolve-Path $indexPath).Path
}

function New-LaunchUrl {
    param(
        [string]$IndexPath,
        [string]$Endpoint
    )

    $indexUri = New-Object System.Uri -ArgumentList $IndexPath
    $encoded = [System.Uri]::EscapeDataString($Endpoint)
    return ($indexUri.AbsoluteUri + "?push=$encoded#push=$encoded")
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
            Write-Warning ("Failed to launch {0} via {1}: {2}" -f $Url, $browserExe, $_)
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
            Write-Warning ("Failed to launch URL {0}: {1}" -f $Url, $_)
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

    try {
        if (Handle-ProtocolRequest -Context $Context -OutputPath $OutputPath -OpenOnSave:$OpenOnSave) {
            return
        }

        if (Handle-DemoRequest -Context $Context) {
            return
        }

        Send-TextResponse -Response $response -StatusCode 405 -Message 'Only PUT, GET, and POST are supported on this service.'
        Write-Host "Received unsupported $($request.HttpMethod) request" -ForegroundColor DarkYellow
    }
    catch {
        Write-Warning "Failed to handle request: $_"
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
$indexPathResolved = Ensure-AppRoot -Root $AppRoot
$endpoint = "http://localhost:$Port/"
$launchUrl = New-LaunchUrl -IndexPath $indexPathResolved -Endpoint $endpoint

Write-Host "Launching Sellfile Creator with push endpoint $endpoint" -ForegroundColor Cyan
Write-Host "Launch URL: $launchUrl" -ForegroundColor DarkGray
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
    Write-Host "Mock RSL Helper listening on $prefix" -ForegroundColor Yellow
    Write-Host "Inbound PUT bodies will be saved to $OutputPath" -ForegroundColor Yellow
    Write-Host 'Press Ctrl+C to stop the listener.' -ForegroundColor DarkGray

    try { [System.Console]::CancelKeyPress += $cancelHandler } catch {}

    $outputDir = Split-Path -Parent $OutputPath
    if ($outputDir -and -not (Test-Path $outputDir)) {
        New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
    }

    Write-Host 'Shortcuts: [T] queue sample tester items, [R] queue sample selectRule.' -ForegroundColor DarkGray

    $pendingContext = $null
    $contextWaitHandle = $null
    try {
        $pendingContext = $listener.BeginGetContext($null, $null)
        $contextWaitHandle = $pendingContext.AsyncWaitHandle
    } catch {
        Write-Warning "Failed to start listener accept loop: $_"
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
            Write-Warning "Listener aborted: $_"
            break
        }
        catch [System.ObjectDisposedException] { break }
        catch {
            Write-Warning "Listener aborted: $_"
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
            Write-Warning "Listener aborted: $_"
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
    Write-Host 'Mock listener stopped.' -ForegroundColor DarkGray
}
#endregion
