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

function Copy-Hashtable {
    <#
        Creates a shallow copy of an incoming dictionary so demo helpers can
        mutate entries without touching the source catalog.
    #>
    param([System.Collections.IDictionary]$Source)

    if (-not $Source) { return @{} }

    $copy = @{}
    foreach ($key in $Source.Keys) { $copy[$key] = $Source[$key] }
    return $copy
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
        $payload = $raw | ConvertFrom-Json -Depth 20 -AsHashtable
    }
    catch {
        throw "Failed to read demo samples from '$CommandsPath': $_"
    }

    if (-not $payload -or -not ($payload.ContainsKey('events'))) {
        throw "Demo samples file '$CommandsPath' is missing an 'events' array."
    }

    $events = @($payload['events'])
    if ($events.Count -eq 0) {
        throw "Demo samples file '$CommandsPath' does not define any events."
    }

    $testerSamples = @()
    $selectSamples = @()
    $testerItemPool = @()
    $testerCounter = 0
    $selectCounter = 0

    foreach ($evt in $events) {
        if (-not ($evt -is [System.Collections.IDictionary])) {
            throw 'Demo samples events must be JSON objects.'
        }

        $evtType = [string]$evt['type']
        switch ($evtType) {
            'testerItems' {
                $testerCounter++
                $sampleIndex = $testerCounter

                if (-not $evt.ContainsKey('items')) {
                    throw "Tester sample #$sampleIndex is missing items."
                }

                $itemsValue = @($evt['items'])
                if ($itemsValue.Count -eq 0) {
                    throw "Tester sample #$sampleIndex is missing items."
                }

                $normalizedItems = @()
                $itemNumber = 0
                foreach ($item in $itemsValue) {
                    $itemNumber++
                    if (-not ($item -is [System.Collections.IDictionary])) {
                        throw "Tester sample #$sampleIndex item #$itemNumber is not an object."
                    }

                    $itemCopy = Copy-Hashtable -Source $item

                    $normalizedItems += ,$itemCopy
                    $testerItemPool += [pscustomobject]@{
                        Item        = $itemCopy
                        SampleIndex = $sampleIndex
                        ItemNumber  = $itemNumber
                    }
                }

                $testerSamples += [pscustomobject]@{
                    SampleIndex = $sampleIndex
                    Items       = $normalizedItems
                }
            }
            'selectRule' {
                $selectCounter++
                $sampleIndex = $selectCounter
                $rowNumberValue = $null

                foreach ($key in @('rowNumber', 'row')) {
                    if (-not $evt.ContainsKey($key)) { continue }
                    $candidate = $evt[$key]
                    if ($candidate -is [int]) { $rowNumberValue = $candidate; break }
                    if ($candidate -is [long]) { $rowNumberValue = [int]$candidate; break }
                    $candidateText = [string]$candidate
                    $parsed = 0
                    if ([int]::TryParse($candidateText, [ref]$parsed)) {
                        $rowNumberValue = $parsed
                        break
                    }
                }

                if ($null -eq $rowNumberValue) {
                    throw "Select sample #$sampleIndex is missing rowNumber."
                }

                $rowNumber = [Math]::Max(1, [int]$rowNumberValue)

                $selectSamples += [pscustomobject]@{
                    SampleIndex = $sampleIndex
                    RowNumber   = $rowNumber
                }
            }
            default { continue }
        }
    }

    if ($selectSamples.Count -eq 0) {
        throw "Demo samples file '$CommandsPath' does not define any selectRule events."
    }

    if ($testerItemPool.Count -eq 0) {
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
    ScrollOffset = 0
    StickToLatest = $true
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

function Set-ConsoleCursorSafe {
    <#
        Moves the cursor without throwing when the console buffer shrinks during
        a window resize. Values are clamped to the current buffer dimensions.
    #>
    param(
        [int]$Left,
        [int]$Top
    )

    $bufferWidth = [Console]::BufferWidth
    $bufferHeight = [Console]::BufferHeight

    if ($bufferWidth -le 0 -or $bufferHeight -le 0) { return }

    if ($Left -lt 0) { $Left = 0 }
    elseif ($Left -ge $bufferWidth) { $Left = $bufferWidth - 1 }

    if ($Top -lt 0) { $Top = 0 }
    elseif ($Top -ge $bufferHeight) { $Top = $bufferHeight - 1 }

    try { [Console]::SetCursorPosition($Left, $Top) } catch {}
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
        Redraws the pinned header plus the rolling log area in place. The view
        keeps the newest entries in sight unless the operator scrolls away.
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

        # Available rows for the scrolling portion (footer line reserved for the cursor).
        $availableLogRows = $windowHeight - $headerCount - $separatorLines - 1
        if ($availableLogRows -lt 0) { $availableLogRows = 0 }

        $visibleRows = [Math]::Max(0, $availableLogRows)
        $desiredOffset = [Math]::Max(0, [int]$state.ScrollOffset)

        # At most two indicator rows render (top/bottom). Clamp upfront so
        # Scroll-LogToStart can reach the true first entry even when both are
        # visible.
        if ($visibleRows -gt 0) {
            $maxIndicatorCost = if ($visibleRows -ge 2) { 2 } elseif ($visibleRows -ge 1) { 1 } else { 0 }
            $maxEntryCapacity = [Math]::Max(0, $visibleRows - $maxIndicatorCost)
            $maxOffsetUpperBound = if ($maxEntryCapacity -gt 0) {
                [Math]::Max(0, $logCount - $maxEntryCapacity)
            } else {
                $logCount
            }
            if ($desiredOffset -gt $maxOffsetUpperBound) {
                $desiredOffset = $maxOffsetUpperBound
            }
        }
        else {
            if ($desiredOffset -gt $logCount) { $desiredOffset = $logCount }
        }

        $indicatorTop = $false
        $indicatorBottom = $false
        $renderStartIndex = 0
        $renderEndIndex = 0
        $scrollOffset = $desiredOffset

        for ($iteration = 0; $iteration -lt 3; $iteration++) {
            $indicatorCount = 0
            if ($indicatorTop) { $indicatorCount++ }
            if ($indicatorBottom) { $indicatorCount++ }
            $entryCapacity = [Math]::Max(0, $visibleRows - $indicatorCount)
            $maxOffset = if ($entryCapacity -gt 0) { [Math]::Max(0, $logCount - $entryCapacity) } else { $logCount }
            $scrollOffset = [Math]::Min($desiredOffset, $maxOffset)

            if ($entryCapacity -le 0) {
                $renderStartIndex = 0
                $renderEndIndex = 0
            }
            else {
                $renderStartIndex = [Math]::Max(0, $logCount - $entryCapacity - $scrollOffset)
                $renderEndIndex = [Math]::Min($logCount, $renderStartIndex + $entryCapacity)
            }

            $previousTop = $indicatorTop
            $previousBottom = $indicatorBottom
            $indicatorTop = ($renderStartIndex -gt 0)
            $indicatorBottom = ($renderEndIndex -lt $logCount)
            if ($indicatorTop -eq $previousTop -and $indicatorBottom -eq $previousBottom) { break }
        }

        $hiddenAboveCount = $renderStartIndex
        $hiddenBelowCount = $logCount - $renderEndIndex
        if ($hiddenBelowCount -lt 0) { $hiddenBelowCount = 0 }

        $state.StickToLatest = ($scrollOffset -eq 0)
        if ($state.ScrollOffset -ne $scrollOffset) {
            $state.ScrollOffset = $scrollOffset
        }

        $renderedLogCount = $renderEndIndex - $renderStartIndex
        if ($renderedLogCount -lt 0) { $renderedLogCount = 0 }

        $indicatorTopLines = if ($indicatorTop) { 1 } else { 0 }
        $indicatorBottomLines = if ($indicatorBottom) { 1 } else { 0 }
        $neededHeight = $headerCount + $separatorLines + $indicatorTopLines + $renderedLogCount + $indicatorBottomLines + 1
        Ensure-ConsoleBufferHeight -MinHeight $neededHeight

        $lineIndex = 0
        Set-ConsoleCursorSafe -Left 0 -Top 0

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
            Set-ConsoleCursorSafe -Left 0 -Top $lineIndex
        }

        if ($headerCount -gt 0 -and ($renderedLogCount -gt 0 -or $indicatorTop -or $indicatorBottom)) {
            $renderText = ''.PadRight($bufferWidth)
            $previous = [Console]::ForegroundColor
            [Console]::Write($renderText)
            [Console]::ForegroundColor = $previous
            $lineIndex++
            Set-ConsoleCursorSafe -Left 0 -Top $lineIndex
        }

        if ($indicatorTop -and $availableLogRows -gt 0) {
            $indicatorText = '... {0} earlier log entries hidden. Use ↑/PageUp to scroll.' -f $hiddenAboveCount
            $renderText = Format-ConsoleLine -Text $indicatorText -Width $bufferWidth
            $previous = [Console]::ForegroundColor
            [Console]::ForegroundColor = [ConsoleColor]::DarkGray
            [Console]::Write($renderText)
            [Console]::ForegroundColor = $previous
            $lineIndex++
            Set-ConsoleCursorSafe -Left 0 -Top $lineIndex
        }

        for ($entryIndex = $renderStartIndex; $entryIndex -lt $renderEndIndex; $entryIndex++) {
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
            Set-ConsoleCursorSafe -Left 0 -Top $lineIndex
        }

        if ($indicatorBottom -and $availableLogRows -gt 0) {
            $indicatorText = '... {0} newer log entries hidden. Use ↓/End to rejoin live logs.' -f $hiddenBelowCount
            $renderText = Format-ConsoleLine -Text $indicatorText -Width $bufferWidth
            $previous = [Console]::ForegroundColor
            [Console]::ForegroundColor = [ConsoleColor]::DarkGray
            [Console]::Write($renderText)
            [Console]::ForegroundColor = $previous
            $lineIndex++
            Set-ConsoleCursorSafe -Left 0 -Top $lineIndex
        }

        for ($i = $lineIndex; $i -lt $state.LastRenderLines; $i++) {
            Set-ConsoleCursorSafe -Left 0 -Top $i
            [Console]::Write(''.PadRight($bufferWidth))
        }

        $state.LastRenderLines = $lineIndex

        $cursorTop = [Math]::Min([Console]::BufferHeight - 1, [Math]::Max(0, $lineIndex))
        Set-ConsoleCursorSafe -Left 0 -Top $cursorTop
        try { [Console]::WindowTop = 0 } catch {}
    }
    finally {
        [System.Threading.Monitor]::Exit($state.RenderLock)
    }
}

function Get-VisibleLogRowCapacity {
    <#
        Estimates the number of rows currently available for log entries so
        scroll shortcuts can move by a "page" without re-implementing layout.
    #>
    $state = $script:ConsoleUiState
    if (-not $state) { return 0 }

    $headerCount = $state.HeaderLines.Count
    $separatorLines = if ($headerCount -gt 0) { 1 } else { 0 }
    $windowHeight = [Console]::WindowHeight
    if ($windowHeight -lt 1) { return 0 }

    $capacity = $windowHeight - $headerCount - $separatorLines - 1
    if ($capacity -lt 0) { $capacity = 0 }
    return $capacity
}

function Set-LogScrollOffset {
    param([int]$Offset)

    $state = $script:ConsoleUiState
    if (-not $state) { return }

    if ($Offset -lt 0) { $Offset = 0 }
    $state.ScrollOffset = $Offset
    $state.StickToLatest = ($Offset -eq 0)
    Render-ConsoleUi
}

function Adjust-LogScrollOffset {
    param([int]$Delta)

    $state = $script:ConsoleUiState
    if (-not $state) { return }

    $target = $state.ScrollOffset + $Delta
    if ($target -lt 0) { $target = 0 }
    $state.ScrollOffset = $target
    $state.StickToLatest = ($target -eq 0)
    Render-ConsoleUi
}

function Scroll-LogToStart {
    $state = $script:ConsoleUiState
    if (-not $state) { return }
    # A very large offset lets Render-ConsoleUi clamp to the earliest entry.
    Set-LogScrollOffset -Offset [int]::MaxValue
}

function Scroll-LogToEnd {
    Set-LogScrollOffset -Offset 0
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

    if ($state.StickToLatest) {
        $state.ScrollOffset = 0
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
    $state.ScrollOffset = 0
    $state.StickToLatest = $true
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

    $parsed = $body | ConvertFrom-Json -Depth 20 -AsHashtable

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
        $bodyData = Read-JsonBody -Request $request

        $parseInt = {
            param($candidate)
            if ($candidate -is [int]) { return $candidate }
            if ($candidate -is [long]) { return [int]$candidate }
            if ($null -eq $candidate) { return $null }
            $candidateText = [string]$candidate
            if ([string]::IsNullOrWhiteSpace($candidateText)) { return $null }
            $parsed = 0
            if ([int]::TryParse($candidateText, [ref]$parsed)) { return $parsed }
            return $null
        }

        $rowNumberValue = $null
        foreach ($candidate in @($request.QueryString['row'], $request.QueryString['rowNumber'])) {
            $parsedValue = & $parseInt $candidate
            if ($null -ne $parsedValue) { $rowNumberValue = $parsedValue; break }
        }

        if ($null -eq $rowNumberValue -and ($bodyData -is [System.Collections.IDictionary])) {
            foreach ($key in @('rowNumber', 'row')) {
                if (-not $bodyData.ContainsKey($key)) { continue }
                $parsedValue = & $parseInt $bodyData[$key]
                if ($null -ne $parsedValue) { $rowNumberValue = $parsedValue; break }
            }
        }

        $sampleMeta = $null
        if ($null -eq $rowNumberValue) {
            # No explicit request; re-use the canned samples so the shortcut stays lively.
            $sampleMeta = Get-RandomSelectSample
            $rowNumberNormalized = $sampleMeta.RowNumber
        } else {
            $rowNumberNormalized = [Math]::Max(1, [int]$rowNumberValue)
        }

        $payloadTable = [ordered]@{
            rowNumber = $rowNumberNormalized
        }

        [void](Add-ProtocolCommandEvent -Type 'selectRule' -Data $payloadTable)
        $responsePayload = @{ status = 'queued'; rowNumber = $rowNumberNormalized }
        if ($sampleMeta) {
            $responsePayload['sample'] = @{ index = $sampleMeta.Index; row = $sampleMeta.RowNumber }
        }
        Send-JsonResponse -Response $response -StatusCode 202 -Payload $responsePayload
        if ($sampleMeta) {
            Write-ConsoleLog -Message ("Queued mock selectRule event rowNumber={0} (sample ##{1})" -f $rowNumberNormalized, $sampleMeta.Index) -Color DarkGray
        } else {
            Write-ConsoleLog -Message "Queued mock selectRule event rowNumber=$rowNumberNormalized" -Color DarkGray
        }
        return $true
    }
    if ($request.HttpMethod -eq 'POST' -and $pathLower -eq '/mock/tester-items') {
        $bodyData = Read-JsonBody -Request $request
        $bodyDictionary = $bodyData -as [System.Collections.IDictionary]

        $items = @()
        if ($bodyDictionary -and $bodyDictionary.Contains('items')) {
            foreach ($artifact in @($bodyDictionary['items'])) {
                if (-not ($artifact -is [System.Collections.IDictionary])) {
                    throw 'testerItems payload items must be objects.'
                }

                $items += ,(Copy-Hashtable -Source $artifact)
            }
        } elseif ($bodyData -and ($bodyData -is [System.Collections.IEnumerable]) -and -not ($bodyData -is [string])) {
            foreach ($artifact in @($bodyData)) {
                if (-not ($artifact -is [System.Collections.IDictionary])) { continue }
                $items += ,(Copy-Hashtable -Source $artifact)
            }
        }

        $randomSelection = $null
        if ($items.Count -eq 0) {
            $randomSelection = Get-RandomTesterItemsSelection
            $items = $randomSelection.Items
        }

        $resolveBool = {
            param($candidate, [bool]$fallback)
            if ($candidate -is [bool]) { return $candidate }
            if ($candidate -is [int]) { return ($candidate -ne 0) }
            if ($candidate -is [long]) { return ([int]$candidate -ne 0) }
            if ($null -eq $candidate) { return $fallback }
            $text = ([string]$candidate).Trim().ToLowerInvariant()
            if ($text.Length -eq 0) { return $fallback }
            if ('1','true','yes','on' -contains $text) { return $true }
            if ('0','false','no','off' -contains $text) { return $false }
            return $fallback
        }

        $openTester = & $resolveBool $request.QueryString['openTester'] $true
        if ($bodyDictionary -and $bodyDictionary.Contains('openTester')) {
            $openTester = & $resolveBool $bodyDictionary['openTester'] $openTester
        }

        $payloadTable = [ordered]@{
            items      = $items
            openTester = [bool]$openTester
        }

        [void](Add-ProtocolCommandEvent -Type 'testerItems' -Data $payloadTable)
        $itemCount = Get-EnumerableCount $items
        $responsePayload = @{ status = 'queued'; items = $itemCount }
        if ($randomSelection) {
            $responsePayload['sample'] = @{
                count         = $randomSelection.Count
                sampleIndices = $randomSelection.SampleIndices
            }
        }
        Send-JsonResponse -Response $response -StatusCode 202 -Payload $responsePayload
        if ($randomSelection) {
            Write-ConsoleLog -Message ("Queued mock testerItems event count={0} (random selection from {1})" -f $itemCount, $randomSelection.SampleSummary) -Color DarkGray
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
        $sourceItem = $entry.Item -as [System.Collections.IDictionary]
        if ($sourceItem) {
            # Preserve the randomised selection as a standalone object for queued events.
            $items += ,(Copy-Hashtable -Source $sourceItem)
        } else {
            $items += ,$entry.Item
        }

        $sampleIndexRaw = $entry.SampleIndex
        if ($null -eq $sampleIndexRaw) { continue }

        if ($sampleIndexRaw -is [int]) { [void]$indicesSet.Add($sampleIndexRaw); continue }
        if ($sampleIndexRaw -is [long]) { [void]$indicesSet.Add([int]$sampleIndexRaw); continue }

        $parsedIndex = 0
        $candidateText = [string]$sampleIndexRaw
        if ([int]::TryParse($candidateText, [ref]$parsedIndex)) {
            [void]$indicesSet.Add($parsedIndex)
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
    Write-ConsoleLog -Message ("Shortcut queued testerItems selection → {0} item(s) from {1}" -f $selection.Count, $selection.SampleSummary) -Color DarkGray
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
    Write-ConsoleLog -Message ("Shortcut queued selectRule sample ##$($sample.Index) → row $rowDisplay") -Color DarkGray
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
            ([System.ConsoleKey]::UpArrow) {
                Adjust-LogScrollOffset -Delta 1
                continue
            }
            ([System.ConsoleKey]::DownArrow) {
                Adjust-LogScrollOffset -Delta -1
                continue
            }
            ([System.ConsoleKey]::PageUp) {
                $page = [Math]::Max(1, $(Get-VisibleLogRowCapacity))
                Adjust-LogScrollOffset -Delta $page
                continue
            }
            ([System.ConsoleKey]::PageDown) {
                $page = [Math]::Max(1, $(Get-VisibleLogRowCapacity))
                Adjust-LogScrollOffset -Delta (-$page)
                continue
            }
            ([System.ConsoleKey]::Home) {
                Scroll-LogToStart
                continue
            }
            ([System.ConsoleKey]::End) {
                Scroll-LogToEnd
                continue
            }
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

        # Periodic housekeeping: expire long-poll requests so the UI reconnects.
        $expiredPolls = @()
        $expiryCheckNow = [DateTime]::UtcNow
        [System.Threading.Monitor]::Enter($script:PendingPollLock)
        try {
            for ($idx = $script:PendingCommandPolls.Count - 1; $idx -ge 0; $idx--) {
                $pendingPoll = $script:PendingCommandPolls[$idx]
                if ($pendingPoll.Expiry -gt $expiryCheckNow) { continue }
                $expiredPolls += $pendingPoll
                $script:PendingCommandPolls.RemoveAt($idx)
            }
        }
        finally {
            [System.Threading.Monitor]::Exit($script:PendingPollLock)
        }

        foreach ($expiredPoll in $expiredPolls) {
            Send-PendingPollResponse -Context $expiredPoll.Context -StatusCode 204 -Payload $null
        }

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
    # Final cleanup: release any pending polls so the client reconnects cleanly.
    $remainingPolls = @()
    [System.Threading.Monitor]::Enter($script:PendingPollLock)
    try {
        if ($script:PendingCommandPolls.Count -gt 0) {
            $remainingPolls = @($script:PendingCommandPolls.ToArray())
            $script:PendingCommandPolls.Clear()
        }
    }
    finally {
        [System.Threading.Monitor]::Exit($script:PendingPollLock)
    }

    foreach ($pendingPoll in $remainingPolls) {
        Send-PendingPollResponse -Context $pendingPoll.Context -StatusCode 204 -Payload $null
    }
    if ($listener.IsListening) { $listener.Stop() }
    $listener.Close()
    $stopSource.Dispose()
    Write-ConsoleLog -Message 'Mock listener stopped.' -Color DarkGray
}
#endregion
