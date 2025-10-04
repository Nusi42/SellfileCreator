<#!
.SYNOPSIS
Launches the built Sellfile Creator in a browser and hosts a lightweight mock
RSL Helper endpoint that accepts pushed sellfiles and command polling.

.DESCRIPTION
- Opens `dist/index.html` with the `push` query/hash parameters targeting the
  HTTP listener started by this script.
- PUT `/` writes the incoming sellfile payload to `mock-export.hsf` (configurable
  via `-OutputPath`).
- GET `/commands` returns queued external command events; POST `/commands`
  enqueues new events for testing.
- Automatically relaunches itself under PowerShell 7 (`pwsh`) when executed from
  Windows PowerShell 5.x or earlier. If `pwsh` cannot be located the script exits
  with an actionable error message.
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

Add-Type -AssemblyName System.Net.HttpListener -ErrorAction SilentlyContinue | Out-Null

$script:commandQueue = New-Object 'System.Collections.Generic.List[Hashtable]'
$script:queueLock = New-Object object
$script:nextCommandId = 1
$script:lastZeroPollLog = [DateTime]::MinValue

function New-Utf8JsonBytes {
    param([Parameter(Mandatory = $true)] $InputObject)
    $json = $InputObject | ConvertTo-Json -Depth 20
    return [System.Text.Encoding]::UTF8.GetBytes($json)
}

function ConvertTo-HashtableStrict {
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

function Get-ItemCount {
    param($Collection)
    if ($null -eq $Collection) { return 0 }
    if ($Collection -is [System.Collections.ICollection]) { return $Collection.Count }
    return 1
}

$script:testerSampleFactories = @(
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

$script:testerSampleCursor = 0
$script:selectSampleCursor = 0
$script:selectSampleIndices = @(10, 20, 30)

function Get-NextTesterSample {
    if ($script:testerSampleFactories.Count -eq 0) {
        return [PSCustomObject]@{ Index = 1; Label = 'sample'; Items = @() }
    }
    $current = $script:testerSampleCursor
    $definition = $script:testerSampleFactories[$current]
    $script:testerSampleCursor = ($current + 1) % $script:testerSampleFactories.Count
    $items = & $definition.Factory
    return [PSCustomObject]@{
        Index = $current + 1
        Label = [string]$definition.Label
        Items = $items
    }
}

function Get-NextSelectSample {
    if ($script:selectSampleIndices.Count -eq 0) {
        return @{ Rotation = 1; Index = 0 }
    }
    $current = $script:selectSampleCursor
    $value = $script:selectSampleIndices[$current]
    $script:selectSampleCursor = ($current + 1) % $script:selectSampleIndices.Count
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
    $event = Add-MockCommandEvent -Type 'testerItems' -Data $payload
    $count = Get-ItemCount $sample.Items
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
    $event = Add-MockCommandEvent -Type 'selectRule' -Data $payload
    Write-Host ("Shortcut queued selectRule sample ##$($sample.Rotation) → row $($sample.Index) (event id=$($event.id))") -ForegroundColor DarkGray
    return $event
}

function Poll-ShortcutInput {
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

function Handle-MockRequest {
    param(
        [System.Net.HttpListenerContext]$Context,
        [string]$OutputPath,
        [bool]$OpenOnSave
    )

    $request = $Context.Request
    $response = $Context.Response

    try {
        if ($request.HttpMethod -eq 'OPTIONS') {
            $response.StatusCode = 204
            Write-CorsHeaders -Response $response
            $response.ContentLength64 = 0
            Write-Host 'Handled CORS preflight' -ForegroundColor DarkGray
            return
        }

        $normalizedPath = $request.Url.AbsolutePath
        if (-not $normalizedPath) { $normalizedPath = '/' }
        if ($normalizedPath.Length -gt 1 -and $normalizedPath.EndsWith('/')) {
            $normalizedPath = $normalizedPath.TrimEnd('/')
        }
        $pathLower = $normalizedPath.ToLowerInvariant()

        if ($request.HttpMethod -eq 'GET' -and $pathLower -eq '/commands') {
            $sinceValue = 0
            $sinceParam = $request.QueryString['since']
            if ($sinceParam) {
                [int]::TryParse($sinceParam, [ref]$sinceValue) | Out-Null
            }
            $events = Get-MockCommandEvents -SinceId $sinceValue
            if ($events.Length -gt 0) {
                $lastEvent = $events[$events.Length - 1]
                if ($lastEvent -and $lastEvent.ContainsKey('id')) {
                    $lastId = [int]$lastEvent['id']
                } else {
                    $lastId = $sinceValue
                }
            } else {
                $lastId = $sinceValue
            }
            Send-JsonResponse -Response $response -StatusCode 200 -Payload @{ events = $events; lastId = $lastId }
            if ($events.Length -gt 0) {
                Write-Host "Served $($events.Length) queued command(s)" -ForegroundColor DarkGray
            } else {
                $now = Get-Date
                if (($now - $script:lastZeroPollLog).TotalSeconds -ge 5) {
                    Write-Host 'Polling heartbeat (0 commands)' -ForegroundColor DarkGray
                    $script:lastZeroPollLog = $now
                }
            }
            return
        }

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
                $ruleIndexNormalized = NormalizeRuleIndex -Value ([Math]::Max(0, $sampleMeta.Index - 1))
            } else {
                $ruleIndexNormalized = NormalizeRuleIndex -Value ($ruleIndexValue - 1)
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

            $event = Add-MockCommandEvent -Type 'selectRule' -Data $payloadTable
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
            return
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
            if (-not $items -or (Get-ItemCount $items) -eq 0) {
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

            $event = Add-MockCommandEvent -Type 'testerItems' -Data $payloadTable
            $itemCount = Get-ItemCount $items
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
            return
        }

        if ($request.HttpMethod -eq 'POST' -and $pathLower -eq '/commands') {
            $deserialized = Read-JsonBody -Request $request
            $dict = ConvertTo-HashtableStrict -Value $deserialized
            if (-not $dict) {
                Send-TextResponse -Response $response -StatusCode 400 -Message 'Body must be a JSON object.'
                return
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
                return
            }

            $payloadTable = @{}
            foreach ($key in $dict.Keys) {
                if ($key -ne $typeKey) {
                    $payloadTable[$key] = $dict[$key]
                }
            }

            $event = Add-MockCommandEvent -Type ([string]$dict[$typeKey]) -Data $payloadTable
            Send-JsonResponse -Response $response -StatusCode 202 -Payload @{ status = 'queued'; id = $event.id }
            Write-Host "Queued mock command event: type=$($event.type) id=$($event.id)" -ForegroundColor DarkGray
            return
        }

        if ($request.HttpMethod -eq 'PUT' -and ($pathLower -eq '/' -or [string]::IsNullOrEmpty($pathLower))) {
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

function NormalizeRuleIndex {
    param($Value)
    $parsed = ConvertToNullableInt -Value $Value
    if ($null -eq $parsed) { return 0 }
    if ($parsed -lt 0) { return 0 }
    return [int]$parsed
}

function Add-MockCommandEvent {
    param(
        [Parameter(Mandatory = $true)][string]$Type,
        [System.Collections.IDictionary]$Data
    )

    $event = $null
    [System.Threading.Monitor]::Enter($script:queueLock)
    try {
        $event = @{
            id        = $script:nextCommandId
            type      = $Type
            timestamp = [DateTime]::UtcNow.ToString('o')
        }
        $script:nextCommandId += 1

        if ($Data) {
            foreach ($key in $Data.Keys) {
                $event[$key] = $Data[$key]
            }
        }

        $script:commandQueue.Add($event) | Out-Null
        if ($script:commandQueue.Count -gt 200) {
            $script:commandQueue.RemoveAt(0)
        }
    }
    finally {
        [System.Threading.Monitor]::Exit($script:queueLock)
    }

    return $event
}

function Get-MockCommandEvents {
    param([int]$SinceId)

    $results = @()
    [System.Threading.Monitor]::Enter($script:queueLock)
    try {
        foreach ($evt in $script:commandQueue) {
            $currentId = 0
            if ($evt.ContainsKey('id')) {
                $currentId = [int]$evt['id']
            }
            if ($currentId -gt $SinceId) {
                $copy = @{}
                foreach ($key in $evt.Keys) { $copy[$key] = $evt[$key] }
                $results += $copy
            }
        }
    }
    finally {
        [System.Threading.Monitor]::Exit($script:queueLock)
    }

    return ,$results
}

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
    # Finds the executable responsible for handling HTML/HTTP so the launch URL
    # can be passed as an explicit argument (Edge/Chrome ignore query params on
    # direct file shell launches).
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

    if (-not $progid) {
        return $null
    }

    $commandKey = "Registry::HKEY_CLASSES_ROOT\\$progid\\shell\\open\\command"
    $command = (Get-ItemProperty -Path $commandKey -ErrorAction SilentlyContinue).'(Default)'
    if (-not $command) {
        return $null
    }

    if ($command -match '^\s*"?([^"]+\.exe)"?') {
        return $matches[1]
    }

    return $null
}

function Open-LaunchUrl {
    param([string]$Url)

    $browserExe = $null
    try {
        $browserExe = Get-DefaultHtmlHandlerExe
    } catch {}

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

function Write-CorsHeaders {
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

$indexPathResolved = Ensure-AppRoot -Root $AppRoot
$endpoint = "http://localhost:$Port/"
$launchUrl = New-LaunchUrl -IndexPath $indexPathResolved -Endpoint $endpoint

Write-Host "Launching Sellfile Creator with push endpoint $endpoint" -ForegroundColor Cyan
Write-Host "Launch URL: $launchUrl" -ForegroundColor DarkGray

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
            if ($listener -and $listener.IsListening) {
                $listener.Stop()
            }
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
        catch [System.ObjectDisposedException] {
            break
        }

        if (-not $signaled) {
            continue
        }

        $context = $null
        try {
            $context = $listener.EndGetContext($pendingContext)
        }
        catch [System.Net.HttpListenerException] {
            if ($stopSource.IsCancellationRequested) {
                break
            }
            Write-Warning "Listener aborted: $_"
            break
        }
        catch [System.ObjectDisposedException] {
            break
        }
        catch {
            Write-Warning "Listener aborted: $_"
            break
        }

        if ($context) {
            Handle-MockRequest -Context $context -OutputPath $OutputPath -OpenOnSave:$OpenOnSave
        }

        if ($stopSource.IsCancellationRequested -or -not $listener.IsListening) {
            break
        }

        try { $contextWaitHandle.Close() } catch {}

        try {
            $pendingContext = $listener.BeginGetContext($null, $null)
            $contextWaitHandle = $pendingContext.AsyncWaitHandle
        }
        catch [System.ObjectDisposedException] {
            break
        }
        catch [System.Net.HttpListenerException] {
            if ($stopSource.IsCancellationRequested) {
                break
            }
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
