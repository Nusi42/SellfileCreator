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
    [switch]$PauseBeforeUiReset,
    [Parameter(DontShow = $true)]
    [switch]$SkipRelaunch
)

Set-StrictMode -Version Latest

$script:ServerStopSource = $null

#region === Protocol quick reference (copy-worthy) ===
# Endpoints below describe the required HTTP surface. Later sections add demo
# helpers and can be omitted in production code.
$script:SellfileCreatorWebProtocolReference = [ordered]@{
    EndpointSummary = 'Sellfile Creator pushes to http://localhost:<port>/'
    Paths = [ordered]@{
        UploadSellfile = [ordered]@{
            Method        = 'PUT'
            Path          = '/{name?}'
            RequestBody   = 'Raw .hsf JSON (see sample-upload-body.json). Persist bytes verbatim.'
            ContentType   = 'application/json; charset=utf-8'
            Response      = '204 No Content + CORS headers. Do not mutate the payload.'
            Notes         = 'Sellfile Creator appends /<timestamped>.hsf automatically; manually supplied /<name> is sanitized and saved alongside the default file.'
        }
        PollCommands = [ordered]@{
            Method        = 'GET'
            Path          = '/commands'
            Events        = @(
                'selectRule → { type: "selectRule", rowNumber }',
                'testerItems → { type: "testerItems", items: ArtifactSummary[], openTester }'
            )
            Notes         = 'Each GET drains the queue; no cursor parameter is needed.'
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
Set-Variable -Name 'SellfileCreatorWebProtocolUploadPath' -Option Constant -Value '/'
Set-Variable -Name 'SellfileCreatorWebProtocolCommandsPath' -Option Constant -Value '/commands'
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
            'PauseBeforeUiReset' { if ($entry.Value) { $null = $argumentList.Add('-PauseBeforeUiReset') } continue }
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
# Everything in this region demonstrates the state the server keeps while
# speaking the Sellfile Creator Web Protocol. The queue is intentionally tiny
# and uses plain hashtables so the shapes are easy to inspect in the console.
$script:SellfileCreatorProtocolState = [ordered]@{
    CommandQueue   = New-Object 'System.Collections.Generic.List[Hashtable]'
    QueueLock      = New-Object object
    MaxQueueLength = 200
}
#endregion

#region === Demo harness state (optional) ===
# Demo helpers supply keyboard shortcuts and sample payloads. None of this is
# required for a production integration. Sample payloads now load from the JSON
# snapshot we already ship alongside the script so we do not keep large blobs of
# inline data in the PowerShell file itself. The catalog is required; the script
# exits when it cannot be loaded so shortcuts never run with stale data.

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
        default { return $null }
    }
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

function Get-DemoSampleCatalog {
    <#
        .SYNOPSIS
        Loads canned tester/select events from sample-commands-response.json.

        .DESCRIPTION
        This keeps the script light while still providing repeatable demo
        payloads for keyboard shortcuts and the demo-only POST helpers. The
        catalog is required; missing or malformed files are treated as fatal
        so shortcuts never run with stale fallback data.
    #>
    param([string]$CommandsPath)

    if (-not $CommandsPath -or -not (Test-Path -LiteralPath $CommandsPath)) {
        throw "Demo samples file '$CommandsPath' was not found."
    }

    try {
        $raw = Get-Content -LiteralPath $CommandsPath -Raw -ErrorAction Stop
        $payload = $raw | ConvertFrom-Json -Depth 20
    }
    catch {
        throw "Failed to read demo samples from '$CommandsPath': $_"
    }

    if (-not $payload -or -not $payload.PSObject.Properties['events']) {
        throw "Demo samples file '$CommandsPath' is missing an 'events' array."
    }

    $testerSamples = @()
    $selectSamples = @()
    $testerItemPool = @()
    $testerCounter = 0
    $selectCounter = 0

    foreach ($evt in @($payload.events)) {
        $evtType = [string]$evt.type
        switch ($evtType) {
            'testerItems' {
                $testerCounter++
                $sampleIndex = $testerCounter

                if (-not $evt.PSObject.Properties['items'] -or -not $evt.items) {
                    throw "Tester sample #$sampleIndex is missing items."
                }

                $normalizedItems = @()
                $itemNumber = 0
                foreach ($item in @($evt.items)) {
                    $itemNumber++
                    $normalized = ConvertTo-HashtableStrict -Value $item
                    if (-not $normalized) {
                        throw "Tester sample #$sampleIndex item #$itemNumber is not an object."
                    }
                    $normalizedItems += $normalized
                    $testerItemPool += [pscustomobject]@{
                        Item        = $normalized
                        SampleIndex = $sampleIndex
                        ItemNumber  = $itemNumber
                    }
                }

                if ($normalizedItems.Count -eq 0) {
                    throw "Tester sample #$sampleIndex is missing items."
                }

                $testerSamples += [pscustomobject]@{
                    SampleIndex = $sampleIndex
                    Items       = $normalizedItems
                }
            }
            'selectRule' {
                $selectCounter++
                $sampleIndex = $selectCounter
                $rowNumber = $null
                $rowProp = $evt.PSObject.Properties['rowNumber']
                if (-not $rowProp) { $rowProp = $evt.PSObject.Properties['row'] }
                if ($rowProp) {
                    $rowNumber = ConvertToNullableInt -Value $rowProp.Value
                }

                if ($null -eq $rowNumber) {
                    throw "Select sample #$sampleIndex is missing rowNumber."
                }

                $rowNumber = [Math]::Max(1, [int]$rowNumber)

                $selectSamples += [pscustomobject]@{
                    SampleIndex = $sampleIndex
                    RowNumber   = $rowNumber
                }
            }
            default { continue }
        }
    }

    if (-not $selectSamples -or $selectSamples.Count -eq 0) {
        throw "Demo samples file '$CommandsPath' does not define any selectRule events."
    }

    if (-not $testerItemPool -or $testerItemPool.Count -eq 0) {
        throw "Demo samples file '$CommandsPath' does not define any testerItems artifacts."
    }

    return [pscustomobject]@{
        TesterSamples   = $testerSamples
        SelectSamples   = $selectSamples
        TesterItemPool  = $testerItemPool
    }
}

$sampleCommandsPath = Join-Path $PSScriptRoot 'sample-commands-response.json'
try {
    $demoSamples = Get-DemoSampleCatalog -CommandsPath $sampleCommandsPath
}
catch {
    Write-Error $_
    exit 1
}

$script:DemoState = [ordered]@{
    TesterSamples      = $demoSamples.TesterSamples
    SelectSamples      = $demoSamples.SelectSamples
    TesterItemPool     = $demoSamples.TesterItemPool
    Random             = [System.Random]::new()
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

    return [pscustomobject]@{ Text = $Text; Color = $Color; Segments = $null }
}

function New-ConsoleSegmentLine {
    param(
        [Parameter(Mandatory = $true)][System.Collections.IEnumerable]$Segments
    )

    $segmentObjects = New-Object 'System.Collections.Generic.List[pscustomobject]'
    $textBuilder = New-Object System.Text.StringBuilder

    foreach ($segment in $Segments) {
        if (-not $segment) { continue }
        $segmentText = if ($segment.Text) { [string]$segment.Text } else { '' }
        $segmentColor = if ($segment.Color) { [ConsoleColor]$segment.Color } else { [ConsoleColor]::Gray }
        [void]$segmentObjects.Add([pscustomobject]@{ Text = $segmentText; Color = $segmentColor })
        [void]$textBuilder.Append($segmentText)
    }

    return [pscustomobject]@{
        Text     = $textBuilder.ToString()
        Color    = [ConsoleColor]::Gray
        Segments = $segmentObjects
    }
}

function Ensure-ConsoleBufferHeight {
    param([int]$MinHeight)

    $windowHeight = [Console]::WindowHeight
    $target = [Math]::Max($MinHeight, $windowHeight)
    $current = [Console]::BufferHeight
    if ($target -le $current) { return }

    $maxHeight = [int][int16]::MaxValue
    if ($target -gt $maxHeight) { $target = $maxHeight }

    try { [Console]::BufferHeight = $target } catch {}
}

function Format-ConsoleLine {
    param(
        [Parameter(Mandatory = $true)][string]$Text,
        [int]$Width
    )

    if ($Width -le 1) { return $Text }

    if ($Text.Length -ge $Width) {
        $trimmed = $Text.Substring(0, [Math]::Max(0, $Width - 1)) + '…'
        return $trimmed
    }

    return $Text.PadRight($Width)
}

function Get-RelativePathDisplay {
    <#
        Converts an absolute path into a concise console-friendly display string
        relative to the current working directory when possible.
    #>
    param([Parameter(Mandatory = $true)][string]$Path)

    if ([string]::IsNullOrWhiteSpace($Path)) { return $Path }

    try {
        $cwd = (Get-Location).ProviderPath
        $absolute = [System.IO.Path]::GetFullPath($Path, $cwd)
        $relative = [System.IO.Path]::GetRelativePath($cwd, $absolute)
        if ([string]::IsNullOrWhiteSpace($relative)) { return $absolute }
        if (-not $relative.StartsWith('.') -and -not $relative.StartsWith('/') -and -not $relative.StartsWith('\')) {
            return (Join-Path '.' $relative)
        }
        return $relative
    }
    catch {
        return $Path
    }
}

function Render-ConsoleLineSegments {
    param(
        [Parameter(Mandatory = $true)][psobject]$Line,
        [int]$Width
    )

    $segments = $Line.Segments
    if (-not $segments -or $segments.Count -eq 0) { return }

    $baseText = if ($Line.Text) { [string]$Line.Text } else { '' }
    $renderText = Format-ConsoleLine -Text $baseText -Width $Width

    $segmentColors = New-Object 'System.Collections.Generic.List[ConsoleColor]'
    foreach ($segment in $segments) {
        $color = if ($segment.Color) { [ConsoleColor]$segment.Color } else { [ConsoleColor]::Gray }
        $text = if ($segment.Text) { [string]$segment.Text } else { '' }
        foreach ($char in $text.ToCharArray()) {
            $segmentColors.Add($color) | Out-Null
        }
    }

    $lastColor = if ($segments.Count -gt 0 -and $segments[$segments.Count - 1].Color) {
        [ConsoleColor]$segments[$segments.Count - 1].Color
    } else {
        [ConsoleColor]::Gray
    }

    $chars = $renderText.ToCharArray()
    for ($i = 0; $i -lt $chars.Length; $i++) {
        $color = if ($i -lt $segmentColors.Count) { $segmentColors[$i] } else { $lastColor }
        $previous = [Console]::ForegroundColor
        [Console]::ForegroundColor = $color
        [Console]::Write($chars[$i])
        [Console]::ForegroundColor = $previous
    }
}

function Render-ConsoleUi {
    <#
        Redraws the pinned header plus the rolling log area in place.
    #>
    $state = $script:ConsoleUiState
    if (-not $state) { return }

    [System.Threading.Monitor]::Enter($state.RenderLock)
    try {
        $bufferWidth = [Console]::BufferWidth
        if ($bufferWidth -lt 1) { $bufferWidth = 80 }

        $headerCount = $state.HeaderLines.Count
        $logCount = $state.LogEntries.Count
        $separatorLines = if ($headerCount -gt 0) { 1 } else { 0 }

        $windowHeight = [Console]::WindowHeight
        if ($windowHeight -lt 1) { $windowHeight = $headerCount + $logCount + 1 }

        # Keep the rolling log focused on the newest entries while preserving the
        # pinned header above it. Older entries remain in memory but drop from the
        # visible slice when the console window is shorter than the accumulated log.
        $availableLogRows = $windowHeight - $headerCount - $separatorLines - 1
        if ($availableLogRows -lt 0) { $availableLogRows = 0 }

        $renderStartIndex = 0
        $showOverflowIndicator = $false

        if ($logCount -gt 0) {
            if ($availableLogRows -le 0) {
                $renderStartIndex = $logCount
            }
            elseif ($logCount -gt $availableLogRows) {
                if ($availableLogRows -gt 1) {
                    $showOverflowIndicator = $true
                    $renderSlots = $availableLogRows - 1
                    $renderStartIndex = $logCount - $renderSlots
                }
                else {
                    $renderStartIndex = $logCount - 1
                }
            }
        }

        if ($renderStartIndex -lt 0) { $renderStartIndex = 0 }
        if ($renderStartIndex -gt $logCount) { $renderStartIndex = $logCount }

        $renderedLogCount = $logCount - $renderStartIndex
        if ($renderedLogCount -lt 0) { $renderedLogCount = 0 }

        $indicatorLines = if ($showOverflowIndicator) { 1 } else { 0 }
        $neededHeight = $headerCount + $separatorLines + $indicatorLines + $renderedLogCount + 1
        Ensure-ConsoleBufferHeight -MinHeight $neededHeight

        $lineIndex = 0
        [Console]::SetCursorPosition(0, 0)

        foreach ($line in $state.HeaderLines) {
            $hasSegments = $false
            if ($line -and $line.PSObject.Properties['Segments']) {
                $segmentsValue = $line.Segments
                if ($segmentsValue -and $segmentsValue.Count -gt 0) { $hasSegments = $true }
            }

            if ($hasSegments) {
                Render-ConsoleLineSegments -Line $line -Width $bufferWidth
            } else {
                $renderText = Format-ConsoleLine -Text $line.Text -Width $bufferWidth
                $previous = [Console]::ForegroundColor
                [Console]::ForegroundColor = $line.Color
                [Console]::Write($renderText)
                [Console]::ForegroundColor = $previous
            }
            $lineIndex++
            if ($lineIndex -lt $neededHeight) {
                [Console]::SetCursorPosition(0, $lineIndex)
            }
        }

        if ($headerCount -gt 0) {
            $renderText = ''.PadRight($bufferWidth)
            $previous = [Console]::ForegroundColor
            [Console]::Write($renderText)
            [Console]::ForegroundColor = $previous
            $lineIndex++
            if ($lineIndex -lt $neededHeight) {
                [Console]::SetCursorPosition(0, $lineIndex)
            }
        }

        if ($showOverflowIndicator) {
            $hiddenCount = $renderStartIndex
            $indicatorText = '... {0} earlier log entries hidden. Increase the window height to reveal more.' -f $hiddenCount

            $renderText = Format-ConsoleLine -Text $indicatorText -Width $bufferWidth
            $previous = [Console]::ForegroundColor
            [Console]::ForegroundColor = [ConsoleColor]::DarkGray
            [Console]::Write($renderText)
            [Console]::ForegroundColor = $previous
            $lineIndex++
            if ($lineIndex -lt $neededHeight) {
                [Console]::SetCursorPosition(0, $lineIndex)
            }
        }

        for ($entryIndex = $renderStartIndex; $entryIndex -lt $logCount; $entryIndex++) {
            $entry = $state.LogEntries[$entryIndex]
            $hasSegments = $false
            if ($entry -and $entry.PSObject.Properties['Segments']) {
                $segmentsValue = $entry.Segments
                if ($segmentsValue -and $segmentsValue.Count -gt 0) { $hasSegments = $true }
            }

            if ($hasSegments) {
                Render-ConsoleLineSegments -Line $entry -Width $bufferWidth
            } else {
                $renderText = Format-ConsoleLine -Text $entry.Text -Width $bufferWidth
                $previous = [Console]::ForegroundColor
                [Console]::ForegroundColor = $entry.Color
                [Console]::Write($renderText)
                [Console]::ForegroundColor = $previous
            }
            $lineIndex++
            if ($lineIndex -lt $neededHeight) {
                [Console]::SetCursorPosition(0, $lineIndex)
            }
        }

        for ($i = $lineIndex; $i -lt $state.LastRenderLines; $i++) {
            [Console]::SetCursorPosition(0, $i)
            [Console]::Write(''.PadRight($bufferWidth))
        }

        $state.LastRenderLines = $lineIndex

        $cursorTop = [Math]::Min([Console]::BufferHeight - 1, [Math]::Max(0, $lineIndex))
        [Console]::SetCursorPosition(0, $cursorTop)
        try { [Console]::WindowTop = 0 } catch {}
    }
    finally {
        [System.Threading.Monitor]::Exit($state.RenderLock)
    }
}

function Write-ConsoleHeader {
    param(
        [Parameter(Mandatory = $true)][object[]]$Message,
        [ConsoleColor]$Color = [ConsoleColor]::Gray
    )

    $state = $script:ConsoleUiState
    foreach ($line in $Message) {
        if ($null -eq $line) { continue }

        if ($line -is [string]) {
            $lineParts = $line -split "`r?`n"
            foreach ($part in $lineParts) {
                $state.HeaderLines.Add((New-ConsoleLine -Text $part -Color $Color)) | Out-Null
            }
            continue
        }

        $hasSegments = $false
        $hasText = $false

        if ($line -is [psobject]) {
            foreach ($property in $line.PSObject.Properties.Name) {
                if ($property -eq 'Segments') { $hasSegments = $true }
                if ($property -eq 'Text') { $hasText = $true }
            }
        }

        if ($hasSegments -and $hasText) {
            $state.HeaderLines.Add($line) | Out-Null
        }
        elseif ($hasText) {
            $state.HeaderLines.Add($line) | Out-Null
        }
        else {
            $state.HeaderLines.Add((New-ConsoleLine -Text ([string]$line) -Color $Color)) | Out-Null
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

function Reset-ConsoleUi {
    $state = $script:ConsoleUiState
    $state.HeaderLines.Clear()
    $state.LogEntries.Clear()
    $state.LastRenderLines = 0
    Clear-Host
}
#endregion

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
# Long-poll support: the app issues GET /commands and expects the response to
# stay open until an event arrives. Pending poll entries hold the HttpListener
# context so Add-ProtocolCommandEvent can reply immediately without the caller
# polling in a tight loop.
$script:PendingCommandPolls = New-Object 'System.Collections.Generic.List[Hashtable]'
$script:PendingPollLock = New-Object object
$script:PendingPollTimeoutSeconds = 30

function Close-ContextResponse {
    param([System.Net.HttpListenerContext]$Context)
    try { $Context.Response.OutputStream.Close() } catch {}
    try { $Context.Response.Close() } catch {}
}

function Send-PendingPollResponse {
    param(
        [System.Net.HttpListenerContext]$Context,
        [int]$StatusCode,
        $Payload
    )

    $response = $Context.Response
    if ($StatusCode -eq 200) {
        Send-JsonResponse -Response $response -StatusCode 200 -Payload @{ events = $Payload }
    } else {
        $response.StatusCode = $StatusCode
        Write-CorsHeaders -Response $response
        $response.ContentLength64 = 0
        Write-HttpLog -Direction Outbound -Message ("{0} No Content ({1})" -f $StatusCode, $Context.Request.RawUrl)
    }
    Close-ContextResponse -Context $Context
}

function Register-PendingCommandPoll {
    param([System.Net.HttpListenerContext]$Context)

    $protocol = $script:SellfileCreatorProtocolState
    $hasQueuedEvents = $false
    [System.Threading.Monitor]::Enter($protocol.QueueLock)
    try {
        $hasQueuedEvents = ($protocol.CommandQueue.Count -gt 0)
    }
    finally {
        [System.Threading.Monitor]::Exit($protocol.QueueLock)
    }

    $entryId = [Guid]::NewGuid()
    # Timeout keeps Sellfile Creator reconnecting periodically so idle sockets
    # do not linger forever when the UI is open but no events arrive.
    $entry = @{ Context = $Context; Expiry = [DateTime]::UtcNow.AddSeconds($script:PendingPollTimeoutSeconds); Id = $entryId }

    [System.Threading.Monitor]::Enter($script:PendingPollLock)
    try {
        $script:PendingCommandPolls.Add($entry)
    }
    finally {
        [System.Threading.Monitor]::Exit($script:PendingPollLock)
    }

    if ($hasQueuedEvents) {
        Complete-PendingCommandPollsIfAny
    }

    $stillPending = $false
    [System.Threading.Monitor]::Enter($script:PendingPollLock)
    try {
        foreach ($existing in $script:PendingCommandPolls) {
            if ($existing.Id -eq $entryId) {
                $stillPending = $true
                break
            }
        }
    }
    finally {
        [System.Threading.Monitor]::Exit($script:PendingPollLock)
    }

    return $stillPending
}

function Drain-ProtocolCommandEvents {
    <# Returns queued events and clears the queue. #>

    $protocol = $script:SellfileCreatorProtocolState
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

function Complete-PendingCommandPollsIfAny {
    # Called after a new event arrives; drains any pending pollers and responds
    # with the same event payload to all of them (first match wins semantics).
    $pending = @()

    [System.Threading.Monitor]::Enter($script:PendingPollLock)
    try {
        if ($script:PendingCommandPolls.Count -eq 0) { return }
        $pending = @($script:PendingCommandPolls.ToArray())
        $script:PendingCommandPolls.Clear()
    }
    finally {
        [System.Threading.Monitor]::Exit($script:PendingPollLock)
    }

    if ($pending.Count -eq 0) { return }

    $events = Drain-ProtocolCommandEvents

    if ($events.Length -eq 0) {
        foreach ($entry in $pending) {
            Send-PendingPollResponse -Context $entry.Context -StatusCode 204 -Payload $null
        }
        return
    }

    foreach ($entry in $pending) {
        Send-PendingPollResponse -Context $entry.Context -StatusCode 200 -Payload $events
    }
}

function Flush-ExpiredPendingCommandPolls {
    # Periodic housekeeping: release any pending polls that exceeded their
    # timeout so Sellfile Creator can reconnect and avoid stale sockets.
    $expired = @()
    $now = [DateTime]::UtcNow

    [System.Threading.Monitor]::Enter($script:PendingPollLock)
    try {
        for ($i = $script:PendingCommandPolls.Count - 1; $i -ge 0; $i--) {
            $entry = $script:PendingCommandPolls[$i]
            if ($entry.Expiry -le $now) {
                $expired += $entry
                $script:PendingCommandPolls.RemoveAt($i)
            }
        }
    }
    finally {
        [System.Threading.Monitor]::Exit($script:PendingPollLock)
    }

    foreach ($entry in $expired) {
        Send-PendingPollResponse -Context $entry.Context -StatusCode 204 -Payload $null
    }
}

function Flush-AllPendingCommandPolls {
    # Invoked during shutdown. Responds 204 to any outstanding polls so the UI
    # can reconnect to the next server instance instead of hanging indefinitely.
    $pending = @()

    [System.Threading.Monitor]::Enter($script:PendingPollLock)
    try {
        if ($script:PendingCommandPolls.Count -eq 0) { return }
        $pending = @($script:PendingCommandPolls.ToArray())
        $script:PendingCommandPolls.Clear()
    }
    finally {
        [System.Threading.Monitor]::Exit($script:PendingPollLock)
    }

    foreach ($entry in $pending) {
        Send-PendingPollResponse -Context $entry.Context -StatusCode 204 -Payload $null
    }
}

function Add-ProtocolCommandEvent {
    <#
        Adds a command event to the server queue consumed by Sellfile Creator's
        `GET /commands` poll. The stored shape mirrors what the browser
        receives: `{ type, ...payload }`.
    #>
    param(
        [Parameter(Mandatory = $true)][string]$Type,
        [System.Collections.IDictionary]$Data
    )

    $protocol = $script:SellfileCreatorProtocolState
    $event = @{ type = $Type }
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

    Complete-PendingCommandPollsIfAny

    return $event
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

function Is-UploadPath {
    <#
        Recognizes PUT upload endpoints. Accepts `/` for backward compatibility
        plus an optional single trailing segment (e.g., `/speed-set`).
    #>
    param([string]$NormalizedPath)

    if ([string]::IsNullOrWhiteSpace($NormalizedPath)) { return $true }

    if ($NormalizedPath -eq $SellfileCreatorWebProtocolUploadPath) { return $true }

    if ($SellfileCreatorWebProtocolUploadPath -eq '/') {
        if ($NormalizedPath.StartsWith('/')) {
            $nextSlash = $NormalizedPath.IndexOf('/', 1)
            if ($nextSlash -eq -1) { return $true }
        }
    }

    return $false
}

function Resolve-UploadTargetPath {
    <#
        Derives the file path that should receive the uploaded payload based on
        the request path. `/` maps to the configured OutputPath, while `/foo`
        resolves to `<OutputDir>/foo.hsf` (sanitized to safe characters).
    #>
    param(
        [string]$RequestPath,
        [string]$OutputPath
    )

    if ([string]::IsNullOrWhiteSpace($RequestPath) -or $RequestPath -eq '/') {
        return $OutputPath
    }

    $pathWithoutQuery = $RequestPath
    $queryIndex = $pathWithoutQuery.IndexOf('?')
    if ($queryIndex -ge 0) {
        $pathWithoutQuery = $pathWithoutQuery.Substring(0, $queryIndex)
    }

    if ($pathWithoutQuery.StartsWith('/')) {
        $pathWithoutQuery = $pathWithoutQuery.Substring(1)
    }

    if ([string]::IsNullOrWhiteSpace($pathWithoutQuery)) { return $OutputPath }

    $firstSegmentEnd = $pathWithoutQuery.IndexOf('/')
    if ($firstSegmentEnd -gt -1) {
        $pathWithoutQuery = $pathWithoutQuery.Substring(0, $firstSegmentEnd)
    }

    $candidate = $pathWithoutQuery.Trim()
    if ([string]::IsNullOrWhiteSpace($candidate)) { return $OutputPath }

    $safeName = [System.Text.RegularExpressions.Regex]::Replace(
        $candidate,
        '[^a-z0-9_.-]',
        '-',
        [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
    )

    if ([string]::IsNullOrWhiteSpace($safeName)) { $safeName = 'upload' }

    if (-not $safeName.EndsWith('.hsf', [System.StringComparison]::OrdinalIgnoreCase)) {
        $safeName = $safeName + '.hsf'
    }

    $baseDirectory = Split-Path -Parent $OutputPath
    if ([string]::IsNullOrWhiteSpace($baseDirectory)) {
        $baseDirectory = (Get-Location).ProviderPath
    }

    return (Join-Path $baseDirectory $safeName)
}

function New-HandleResult {
    param(
        [bool]$Handled,
        [bool]$Deferred = $false
    )

    return [pscustomobject]@{ handled = $Handled; deferred = $Deferred }
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
        [bool]$OpenOnSave,
        [string]$RequestPath
    )

    $request = $Context.Request
    $response = $Context.Response

    $targetPath = Resolve-UploadTargetPath -RequestPath $RequestPath -OutputPath $OutputPath
    $targetDirectory = Split-Path -Parent $targetPath
    if ($targetDirectory -and -not (Test-Path $targetDirectory)) {
        New-Item -ItemType Directory -Path $targetDirectory -Force | Out-Null
    }

    $fileStream = [System.IO.File]::Open($targetPath, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write, [System.IO.FileShare]::Read)
    try {
        $request.InputStream.CopyTo($fileStream)
    }
    finally {
        $fileStream.Dispose()
    }

    $fileInfo = [System.IO.FileInfo]::new($targetPath)
    $fileSize = $fileInfo.Length
    $displayPath = Get-RelativePathDisplay -Path $fileInfo.FullName
    Write-ConsoleLog -Message "Saved Sellfile payload ($fileSize bytes) to $displayPath" -Color Green
    if ($OpenOnSave) {
        try {
            Start-Process $fileInfo.FullName | Out-Null
            Write-ConsoleLog -Message "Opened $displayPath" -Color DarkGray
        } catch {
            Write-ConsoleLog -Message ("Failed to open {0}: {1}" -f $displayPath, $_) -Color DarkYellow
        }
    }
    $response.StatusCode = 204
    Write-CorsHeaders -Response $response
    $response.ContentLength64 = 0

    Write-HttpLog -Direction Outbound -Message ("204 No Content ({0})" -f $request.RawUrl)

    return (New-HandleResult -Handled $true)
}

function Invoke-GetCommands {
    <#
        Handles GET /commands — Sellfile Creator polls for queued events here.
        Requests park on the server until an event is available (or the poll
        times out) so the UI does not hammer the endpoint unnecessarily.
        See sample-commands-response.json for shape.
    #>
    param(
        [System.Net.HttpListenerContext]$Context
    )

    $response = $Context.Response
    $events = Drain-ProtocolCommandEvents

    if ($events.Length -eq 0) {
        if (Register-PendingCommandPoll -Context $Context) {
            return (New-HandleResult -Handled $true -Deferred $true)
        }

        return (New-HandleResult -Handled $true)
    }

    $count = $events.Length
    Send-JsonResponse -Response $response -StatusCode 200 -Payload @{ events = $events }
    Write-ConsoleLog -Message "Served $count queued command(s)" -Color DarkGray

    return (New-HandleResult -Handled $true)
}

function Write-ProtocolQuickReference {
    <#
        Prints a terse cheatsheet so developers can see the required endpoints
        without reading the entire file.
    #>
    $paths = $script:SellfileCreatorWebProtocolReference.Paths
    $putLabel = ('{0} {1}' -f $paths.UploadSellfile.Method, $paths.UploadSellfile.Path).PadRight(14)
    $getLabel = ('{0} {1}' -f $paths.PollCommands.Method, $paths.PollCommands.Path).PadRight(14)
    $optionsLabel = 'OPTIONS *'.PadRight(14)

    Write-ConsoleHeader -Message (New-ConsoleSegmentLine -Segments @(
            @{ Text = '--- Sellfile Creator Web Protocol quick reference --- '; Color = [ConsoleColor]::DarkCyan }
            @{ Text = '[inbound] '; Color = [ConsoleColor]::Cyan }
            @{ Text = '[outbound]'; Color = [ConsoleColor]::Magenta }
        ))

    Write-ConsoleHeader -Message (New-ConsoleSegmentLine -Segments @(
            @{ Text = $putLabel; Color = [ConsoleColor]::Cyan }
            @{ Text = 'save raw .hsf JSON (app appends /<timestamp>.hsf), '; Color = [ConsoleColor]::Gray }
            @{ Text = 'respond 204 No Content'; Color = [ConsoleColor]::Magenta }
        ))

    Write-ConsoleHeader -Message (New-ConsoleSegmentLine -Segments @(
            @{ Text = $getLabel; Color = [ConsoleColor]::Cyan }
            @{ Text = 'long-poll queued events; '; Color = [ConsoleColor]::Gray }
            @{ Text = 'respond with { events: [...] }'; Color = [ConsoleColor]::Magenta }
        ))

    Write-ConsoleHeader -Message (New-ConsoleSegmentLine -Segments @(
            @{ Text = '      Events:'; Color = [ConsoleColor]::Gray }
            @{ Text = ' selectRule '; Color = [ConsoleColor]::Magenta }
            @{ Text = '→ focus preview row (rowNumber)'; Color = [ConsoleColor]::Gray }
        ))

    Write-ConsoleHeader -Message (New-ConsoleSegmentLine -Segments @(
            @{ Text = '             '; Color = [ConsoleColor]::Gray }
            @{ Text = ' testerItems '; Color = [ConsoleColor]::Magenta }
            @{ Text = '→ open Rule Tester with provided artifacts (optional openTester flag)'; Color = [ConsoleColor]::Gray }
        ))

    Write-ConsoleHeader -Message (New-ConsoleSegmentLine -Segments @(
            @{ Text = $optionsLabel; Color = [ConsoleColor]::Cyan }
            @{ Text = 'browser CORS preflight; '; Color = [ConsoleColor]::Gray }
            @{ Text = 'reply 204 with Access-Control-Allow-* headers'; Color = [ConsoleColor]::Magenta }
        ))
}

function Handle-ProtocolRequest {
    <#
        Handles the endpoints that the server exposes for the Sellfile Creator
        Web Protocol. Returns $true when the request has been handled.
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
        return (New-HandleResult -Handled $true)
    }

    $pathLower = Get-NormalizedPath -Request $request

    switch ($request.HttpMethod.ToUpperInvariant()) {
        'GET' {
            if ($pathLower -eq $SellfileCreatorWebProtocolCommandsPath) {
                return (Invoke-GetCommands -Context $Context)
            }
        }
        'PUT' {
            if (Is-UploadPath -NormalizedPath $pathLower) {
                return (Invoke-UploadSellfile -Context $Context -OutputPath $OutputPath -OpenOnSave:$OpenOnSave -RequestPath $request.Url.AbsolutePath)
            }
        }
    }

    return (New-HandleResult -Handled $false)
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

        $rowNumberValue = ConvertToNullableInt -Value $request.QueryString['row']
        if ($null -eq $rowNumberValue) {
            $rowNumberValue = ConvertToNullableInt -Value $request.QueryString['rowNumber']
        }
        if ($null -eq $rowNumberValue -and $bodyDict) {
            if ($bodyDict.ContainsKey('rowNumber')) {
                $rowNumberValue = ConvertToNullableInt -Value $bodyDict['rowNumber']
            } elseif ($bodyDict.ContainsKey('row')) {
                $rowNumberValue = ConvertToNullableInt -Value $bodyDict['row']
            }
        }

        $sampleMeta = $null
        if ($null -eq $rowNumberValue) {
            $sampleMeta = Get-RandomSelectSample
            $rowNumberNormalized = $sampleMeta.RowNumber
        } else {
            $rowNumberNormalized = [Math]::Max(1, [int]$rowNumberValue)
        }

        $payloadTable = @{
            rowNumber = $rowNumberNormalized
        }

        $event = Add-ProtocolCommandEvent -Type 'selectRule' -Data $payloadTable
        $responsePayload = @{ status = 'queued'; rowNumber = $rowNumberNormalized }
        if ($sampleMeta) {
            $rowNumber = $sampleMeta.RowNumber
            $responsePayload['sample'] = @{
                index     = $sampleMeta.Index
                row       = $rowNumber
            }
        }
        Send-JsonResponse -Response $response -StatusCode 202 -Payload $responsePayload
        if ($sampleMeta) {
            $rowNumber = $sampleMeta.RowNumber
            Write-ConsoleLog -Message (
                "Queued mock selectRule event rowNumber={0} (sample ##{1})" -f $rowNumberNormalized, $sampleMeta.Index
            ) -Color DarkGray
        } else {
            Write-ConsoleLog -Message "Queued mock selectRule event rowNumber=$rowNumberNormalized" -Color DarkGray
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
        $randomSelection = $null
        if (-not $items -or (Get-EnumerableCount $items) -eq 0) {
            $randomSelection = Get-RandomTesterItemsSelection
            $items = $randomSelection.Items
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
        if ($randomSelection) {
            $responsePayload['sample'] = @{
                count          = $randomSelection.Count
                sampleIndices  = $randomSelection.SampleIndices
            }
        }
        Send-JsonResponse -Response $response -StatusCode 202 -Payload $responsePayload
        if ($randomSelection) {
            Write-ConsoleLog -Message (
                "Queued mock testerItems event count={0} (random selection from {1})" -f $itemCount, $randomSelection.SampleSummary
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
function Get-RandomSelectSample {
    $state = $script:DemoState
    $samples = $state.SelectSamples
    if (-not $samples -or $samples.Count -eq 0) {
        return [pscustomobject]@{ Index = 1; RowNumber = 1 }
    }

    $random = $state.Random
    if (-not $random) {
        $random = [System.Random]::new()
        $state.Random = $random
    }

    $idx = $random.Next(0, $samples.Count)
    $definition = $samples[$idx]
    return [pscustomobject]@{
        Index     = $idx + 1
        RowNumber = [int]$definition.RowNumber
    }
}

function Get-RandomTesterItemsSelection {
    $state = $script:DemoState
    $pool = $state.TesterItemPool
    if (-not $pool -or $pool.Count -eq 0) {
        throw 'Tester item samples are not available.'
    }

    $random = $state.Random
    if (-not $random) {
        $random = [System.Random]::new()
        $state.Random = $random
    }

    $selectionCount = $random.Next(1, $pool.Count + 1)
    $shuffled = $pool | Sort-Object { $random.Next() }
    $chosen = $shuffled | Select-Object -First $selectionCount

    $items = @()
    $indicesSet = New-Object 'System.Collections.Generic.HashSet[int]'
    foreach ($entry in $chosen) {
        $items += ConvertTo-HashtableStrict -Value $entry.Item
        $sampleIndexRaw = $entry.SampleIndex
        if ($null -ne $sampleIndexRaw) {
            if ($sampleIndexRaw -is [int]) { [void]$indicesSet.Add($sampleIndexRaw) }
            elseif ($sampleIndexRaw -is [long]) { [void]$indicesSet.Add([int]$sampleIndexRaw) }
            else {
                $parsedIndex = ConvertToNullableInt -Value $sampleIndexRaw
                if ($null -ne $parsedIndex) { [void]$indicesSet.Add($parsedIndex) }
            }
        }
    }

    $sampleIndices = @()
    if ($indicesSet.Count -gt 0) {
        $sampleIndices = @($indicesSet.GetEnumerator() | Sort-Object)
    }

    $summary = if ($sampleIndices.Length -gt 0) {
        $formatted = $sampleIndices | ForEach-Object { '#{0}' -f $_ }
        [string]::Join(', ', $formatted)
    } else {
        'samples'
    }

    return [pscustomobject]@{
        Items         = $items
        Count         = $items.Count
        SampleIndices = $sampleIndices
        SampleSummary = $summary
    }
}

function Queue-SampleTesterItems {
    $selection = Get-RandomTesterItemsSelection
    $payload = @{
        items      = $selection.Items
        openTester = $true
    }
    $event = Add-ProtocolCommandEvent -Type 'testerItems' -Data $payload
    Write-ConsoleLog -Message (
        "Shortcut queued testerItems selection → {0} item(s) from {1}" -f $selection.Count, $selection.SampleSummary
    ) -Color DarkGray
    return $event
}

function Queue-SampleSelectRule {
    $sample = Get-RandomSelectSample
    $payload = @{
        rowNumber = $sample.RowNumber
    }
    $event = Add-ProtocolCommandEvent -Type 'selectRule' -Data $payload
    $rowDisplay = $sample.RowNumber
    # Log using the human-friendly 1-based row number to mirror the grid UI.
    Write-ConsoleLog -Message (
        "Shortcut queued selectRule sample ##$($sample.Index) → row $rowDisplay"
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
    return ($indexUri.AbsoluteUri + "?endpoint=$encoded")
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

    $deferResponse = $false

    try {
        $protocolResult = Handle-ProtocolRequest -Context $Context -OutputPath $OutputPath -OpenOnSave:$OpenOnSave
        if ($protocolResult -and $protocolResult.handled) {
            if ($protocolResult.deferred) {
                $deferResponse = $true
            }
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
        if (-not $deferResponse) {
            try { $response.OutputStream.Close() } catch {}
            try { $response.Close() } catch {}
            if ($request.InputStream) { $request.InputStream.Dispose() }
        }
    }
}
#endregion

#region === Runtime setup & listener loop ===
$indexPathResolved = Resolve-AppEntryPath -Root $AppRoot
$endpoint = "http://localhost:$Port/"
$launchUrl = New-LaunchUrl -IndexPath $indexPathResolved -Endpoint $endpoint

if ($PauseBeforeUiReset) {
    Write-Warning 'Pausing before console reset; press Enter to continue once you have captured any startup errors.'
    try { [void][System.Console]::ReadLine() } catch {}
}

Reset-ConsoleUi

Write-ConsoleHeader -Message "Launching Sellfile Creator with endpoint $endpoint" -Color Cyan
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
$script:ServerStopSource = $stopSource
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

    # Render the target file relative to the active working directory so the
    # banner stays compact regardless of the launch location.
    $cwd = (Get-Location).ProviderPath
    $absoluteOutputPath = [System.IO.Path]::GetFullPath($OutputPath, $cwd)
    $relativeOutputDisplay = Get-RelativePathDisplay -Path $absoluteOutputPath

    Write-ConsoleHeader -Message ("Listening on {0} → saving PUT payloads to {1}" -f $prefix, $relativeOutputDisplay) -Color Yellow

    try { [System.Console]::CancelKeyPress += $cancelHandler } catch {}

    $outputDir = Split-Path -Parent $OutputPath
    if ($outputDir -and -not (Test-Path $outputDir)) {
        New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
    }

    Write-ConsoleHeader -Message 'Shortcuts: [T] queue sample tester items, [R] queue sample selectRule. Press Ctrl+C to stop the listener.' -Color DarkGray

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

        Flush-ExpiredPendingCommandPolls

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
    Flush-AllPendingCommandPolls
    if ($listener.IsListening) { $listener.Stop() }
    $listener.Close()
    $stopSource.Dispose()
    $script:ServerStopSource = $null
    Write-ConsoleLog -Message 'Mock listener stopped.' -Color DarkGray
}
#endregion
