<#
.SYNOPSIS
WebSocket-based DB watcher for Sellfile Creator.

.DESCRIPTION
Hosts a WebSocket endpoint for external commands, launches the UI with a ws://
endpoint query param, and can watch a local RSL Helper DB for changes.

This core script is dot-sourced by protocol-specific wrappers.
#>
Set-StrictMode -Version Latest

# Read the desired protocol mode from the wrapper (defaults to jsonrpc).
$protocolMode = $script:ProtocolMode
if ([string]::IsNullOrWhiteSpace($protocolMode)) {
    $protocolMode = 'jsonrpc'
}

# Map the protocol mode to a WebSocket subprotocol token.
$protocolMode = $protocolMode.Trim().ToLowerInvariant()
$protocolSubprotocol = if ($protocolMode -eq 'helper') { 'helper' } else { 'jsonrpc' }

# Explorer's "Run with PowerShell" host fails on advanced `param` blocks. The
# script still needs defaults and optional switches, so we emulate the binder.
$defaultParameters = [ordered]@{
    Port                = 8765
    AppRoot             = (Split-Path -Parent $PSScriptRoot)
    OutputPath          = (Join-Path $PSScriptRoot 'exported-sellfile.hsf')
    WatchGearDb         = $true
    GearDbPath          = $null
}

# Canonical names keep aliases in sync with the known parameter set.
$canonicalNames = @{
    'port'               = 'Port'
    'approot'            = 'AppRoot'
    'outputpath'         = 'OutputPath'
    'watchgeardb'        = 'WatchGearDb'
    'geardbpath'         = 'GearDbPath'
}

# Boolean parameters are treated as flags or explicit true/false values.
$booleanParameters = @('WatchGearDb')

# Seed parameter values with defaults so missing args are predictable.
$resolvedParameters = [ordered]@{}
foreach ($entry in $defaultParameters.GetEnumerator()) {
    $resolvedParameters[$entry.Key] = $entry.Value
}

# Capture which parameters were supplied explicitly for pwsh relaunch.
$boundParameterLookup = New-Object 'System.Collections.Generic.Dictionary[string,object]' ([System.StringComparer]::OrdinalIgnoreCase)

function Set-ResolvedParameter {
    param(
        [string]$Name,
        $Value
    )

    # Ignore unknown keys so typos do not pollute the state.
    if (-not $resolvedParameters.Contains($Name)) { return }
    $resolvedParameters[$Name] = $Value
    $boundParameterLookup[$Name] = $Value
}

function Parse-BooleanValue {
    param([string]$Input)

    switch -Regex ($Input) {
        '^(1|true|yes|on)$'  { return $true }
        '^(0|false|no|off)$' { return $false }
        default              { return $null }
    }
}

# Manual argument parsing so non-advanced hosts still work.
$argIndex = 0
while ($argIndex -lt $args.Count) {
    $token = $args[$argIndex]
    $argIndex++

    # Positional arguments are ignored; we only surface named switches.
    if (-not ($token -is [string]) -or -not $token.StartsWith('-')) { continue }

    # Accept both `-Name:value` and `--Name:value` styles.
    if ($token -match '^-{1,2}(?<name>[^:]+):(?<value>.*)$') {
        $name = $matches['name']
        $valueText = $matches['value']
    }
    else {
        $name = $token.TrimStart('-')
        $valueText = $null
        if ($argIndex -lt $args.Count) {
            $nextToken = $args[$argIndex]
            if ($nextToken -is [string] -and -not $nextToken.StartsWith('-')) {
                $valueText = $nextToken
                $argIndex++
            }
        }
    }

    # Ignore empty names or unknown parameter aliases.
    if (-not $name) { continue }
    $canonical = $canonicalNames[$name.ToLowerInvariant()]
    if (-not $canonical) { continue }

    # Handle boolean switches and optional explicit values.
    if ($booleanParameters -contains $canonical) {
        if ($null -ne $valueText) {
            $parsedBool = Parse-BooleanValue -Input $valueText.ToLowerInvariant()
            if ($null -ne $parsedBool) {
                Set-ResolvedParameter -Name $canonical -Value $parsedBool
            } else {
                Set-ResolvedParameter -Name $canonical -Value $true
            }
        } else {
            Set-ResolvedParameter -Name $canonical -Value $true
        }
        continue
    }

    # Ignore parameters that were provided without values.
    if ($null -eq $valueText) { continue }

    switch ($canonical) {
        'Port' {
            $parsedPort = $null
            if ([int]::TryParse($valueText, [ref]$parsedPort)) {
                Set-ResolvedParameter -Name $canonical -Value ([int]$parsedPort)
            }
        }
        'AppRoot' {
            Set-ResolvedParameter -Name $canonical -Value ([string]$valueText)
        }
        'OutputPath' {
            Set-ResolvedParameter -Name $canonical -Value ([string]$valueText)
        }
        default {}
    }
}

# Emit resolved parameters into the local scope.
foreach ($entry in $resolvedParameters.GetEnumerator()) {
    Set-Variable -Name $entry.Key -Value $entry.Value -Scope Local
}

#region === PowerShell host bootstrap ===
# Relaunch under PowerShell 7 because HttpListener + WebSocket APIs require it.
$runningOnPwsh7 = ($PSVersionTable.PSVersion.Major -ge 7 -and $PSVersionTable.PSEdition -eq 'Core')
if (-not $runningOnPwsh7) {
    Write-Error 'PowerShell 7 (pwsh) is required to run this script. Download it from https://aka.ms/powershell and retry.'
    exit 1
}
#endregion

try {
    # Ensure console output stays UTF-8 for JSON snippets.
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
} catch {
    Write-Verbose "Failed to set console output encoding to UTF-8: $_"
}

# Load HttpListener types so AcceptWebSocketAsync is available.
Add-Type -AssemblyName System.Net.HttpListener -ErrorAction SilentlyContinue | Out-Null

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
    param([switch]$SkipLock)
    <#
        Redraws the pinned header plus the rolling log area in place. The view
        keeps the newest entries in sight unless the operator scrolls away.
    #>

    $state = $script:ConsoleUiState

    # Optionally reuse an existing lock when callers already hold it.
    $lockTaken = $false
    if (-not $SkipLock) {
        [System.Threading.Monitor]::Enter($state.RenderLock)
        $lockTaken = $true
    }

    try {
        $bufferWidth = [Console]::BufferWidth
        if ($bufferWidth -lt 1) { $bufferWidth = 80 }

        $cursorPreviouslyVisible = $null
        $cursorVisibilityChanged = $false
        try {
            $cursorPreviouslyVisible = [Console]::CursorVisible
            [Console]::CursorVisible = $false
            $cursorVisibilityChanged = $true
        } catch {}

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

        if ($cursorVisibilityChanged) {
            try { [Console]::CursorVisible = $cursorPreviouslyVisible } catch {}
        }
    }
    finally {
        if ($lockTaken) {
            [System.Threading.Monitor]::Exit($state.RenderLock)
        }
    }
}

function Get-VisibleLogRowCapacity {
    <#
        Estimates the number of rows currently available for log entries so
        scroll shortcuts can move by a "page" without re-implementing layout.
    #>
    $state = $script:ConsoleUiState

    $headerCount = $state.HeaderLines.Count
    $separatorLines = if ($headerCount -gt 0) { 1 } else { 0 }
    $windowHeight = [Console]::WindowHeight
    if ($windowHeight -lt 1) { return 1 }

    $capacity = $windowHeight - $headerCount - $separatorLines - 1
    if ($capacity -lt 1) { return 1 }
    return $capacity
}

function Set-LogScrollOffset {
    param([int]$Offset)

    $state = $script:ConsoleUiState
    # Serialize scroll updates with the render loop to avoid races.
    [System.Threading.Monitor]::Enter($state.RenderLock)
    try {
        if ($Offset -lt 0) { $Offset = 0 }
        $state.ScrollOffset = $Offset
        $state.StickToLatest = ($Offset -eq 0)
        Render-ConsoleUi -SkipLock
    }
    finally {
        [System.Threading.Monitor]::Exit($state.RenderLock)
    }
}

function Adjust-LogScrollOffset {
    param([int]$Delta)

    $state = $script:ConsoleUiState
    # Keep scroll math and rendering atomic across threads.
    [System.Threading.Monitor]::Enter($state.RenderLock)
    try {
        $target = $state.ScrollOffset + $Delta
        if ($target -lt 0) { $target = 0 }
        $state.ScrollOffset = $target
        $state.StickToLatest = ($target -eq 0)
        Render-ConsoleUi -SkipLock
    }
    finally {
        [System.Threading.Monitor]::Exit($state.RenderLock)
    }
}

function Scroll-LogToStart {
    $state = $script:ConsoleUiState
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
    # Guard header mutations so background WS tasks cannot race renders.
    [System.Threading.Monitor]::Enter($state.RenderLock)
    try {
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

        Render-ConsoleUi -SkipLock
    }
    finally {
        [System.Threading.Monitor]::Exit($state.RenderLock)
    }
}

function Write-ConsoleLog {
    param(
        [Parameter(Mandatory = $true)][string[]]$Message,
        [ConsoleColor]$Color = [ConsoleColor]::Gray
    )

    $state = $script:ConsoleUiState
    # Serialize log writes with rendering to avoid collection mutation races.
    [System.Threading.Monitor]::Enter($state.RenderLock)
    try {
        foreach ($line in $Message) {
            $lineParts = $line -split "`r?`n"
            foreach ($part in $lineParts) {
                $state.LogEntries.Add((New-ConsoleLine -Text $part -Color $Color)) | Out-Null
            }
        }

        $removed = 0
        while ($state.LogEntries.Count -gt $state.MaxLogEntries) {
            $state.LogEntries.RemoveAt(0)
            $removed += 1
        }

        if ($removed -gt 0 -and $state.ScrollOffset -gt 0) {
            # Keep the user's scroll position stable when trimming old logs.
            $state.ScrollOffset = [Math]::Max(0, $state.ScrollOffset - $removed)
        }

        if ($state.StickToLatest) {
            $state.ScrollOffset = 0
        }

        Render-ConsoleUi -SkipLock
    }
    finally {
        [System.Threading.Monitor]::Exit($state.RenderLock)
    }
}

function Reset-ConsoleUi {
    $state = $script:ConsoleUiState
    # Reset state under lock so background logging cannot interleave.
    [System.Threading.Monitor]::Enter($state.RenderLock)
    try {
        $state.HeaderLines.Clear()
        $state.LogEntries.Clear()
        $state.LastRenderLines = 0
        $state.ScrollOffset = 0
        $state.StickToLatest = $true
        Clear-Host
    }
    finally {
        [System.Threading.Monitor]::Exit($state.RenderLock)
    }
}

function Write-Log {
    param(
        [Parameter(Mandatory = $true)][string]$Message,
        [ConsoleColor]$Color = [ConsoleColor]::Gray
    )

    Write-ConsoleLog -Message $Message -Color $Color
}

function Write-WsLog {
    param(
        [Parameter(Mandatory = $true)][ValidateSet('Inbound','Outbound')]$Direction,
        [Parameter(Mandatory = $true)][string]$Message
    )

    switch ($Direction) {
        'Inbound'  { Write-ConsoleLog -Message ("← $Message") -Color Cyan }
        'Outbound' { Write-ConsoleLog -Message ("→ $Message") -Color Magenta }
    }
}

function Write-LogInbound {
    param([Parameter(Mandatory = $true)][string]$Message)

    Write-WsLog -Direction Inbound -Message $Message
}

function Write-LogOutbound {
    param([Parameter(Mandatory = $true)][string]$Message)

    Write-WsLog -Direction Outbound -Message $Message
}
#endregion

#region === Protocol helpers ===
# Maintain the set of active clients so we can broadcast events.
$script:WsClients = New-Object 'System.Collections.Generic.List[Hashtable]'
$script:WsClientLock = New-Object object
# Larger frames reduce receive polling latency for big uploads.
$script:WsReceiveBufferSize = 65536
# Cap per-tick drain to keep UI/DB work responsive.
$script:WsReceiveDrainLimit = 25
# Keep JSON depth high enough for nested payloads to avoid truncation warnings.
$script:WsJsonDepth = 100
# Cache the most recent gear DB payload so late clients can sync immediately.
$script:LastGearDbFilePayload = $null
# Track when a connected client needs a post-connect DB sync.
$script:NeedsGearDbSync = $false
# Avoid hammering the DB on repeated sync retries.
$script:NextGearDbSyncUtc = [DateTime]::MinValue

function Get-WsClientsSnapshot {
    # Copy the client list under lock to avoid mutation during iteration.
    [System.Threading.Monitor]::Enter($script:WsClientLock)
    try {
        return @($script:WsClients.ToArray())
    }
    finally {
        [System.Threading.Monitor]::Exit($script:WsClientLock)
    }
}

function Add-WsClient {
    param([System.Net.WebSockets.WebSocket]$Socket)

    $entry = [ordered]@{
        Id     = [Guid]::NewGuid()
        Socket = $Socket
        # Use a larger buffer to avoid long uploads timing out.
        ReceiveBuffer  = New-Object byte[] $script:WsReceiveBufferSize
        ReceiveSegment = $null
        ReceiveBuilder = New-Object System.Text.StringBuilder
        ReceiveTask    = $null
        ReceiveBytes   = 0
        ReceiveNextLog = 1048576
        NeedsGearDbSync = $false
    }
    # Initialize the shared receive segment once per client.
    $entry.ReceiveSegment = [System.ArraySegment[byte]]::new($entry.ReceiveBuffer)

    [System.Threading.Monitor]::Enter($script:WsClientLock)
    try {
        $script:WsClients.Add($entry) | Out-Null
    }
    finally {
        [System.Threading.Monitor]::Exit($script:WsClientLock)
    }

    return $entry
}

function Remove-WsClient {
    param([System.Collections.IDictionary]$Client)

    if (-not $Client) { return }
    # Close sockets so pending receives stop cleanly.
    $socket = $Client.Socket
    if ($socket -and $socket.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
        try {
            $socket.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, 'Closing', [System.Threading.CancellationToken]::None).GetAwaiter().GetResult() | Out-Null
        } catch {}
    }
    [System.Threading.Monitor]::Enter($script:WsClientLock)
    try {
        for ($idx = $script:WsClients.Count - 1; $idx -ge 0; $idx--) {
            if ($script:WsClients[$idx].Id -eq $Client.Id) {
                $script:WsClients.RemoveAt($idx)
                break
            }
        }
    }
    finally {
        [System.Threading.Monitor]::Exit($script:WsClientLock)
    }
}

function Send-WebSocketText {
    param(
        [System.Net.WebSockets.WebSocket]$Socket,
        [string]$Text
    )

    if (-not $Socket -or $Socket.State -ne [System.Net.WebSockets.WebSocketState]::Open) { return $false }
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
    $segment = [System.ArraySegment[byte]]::new($bytes)
    try {
        $Socket.SendAsync($segment, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, [System.Threading.CancellationToken]::None).GetAwaiter().GetResult() | Out-Null
        return $true
    }
    catch {
        Write-Log -Message ("WebSocket send failed ({0} bytes): {1}" -f $bytes.Length, $_) -Color DarkYellow
        Write-ConsoleLog -Message ("WebSocket send failed ({0} bytes): {1}" -f $bytes.Length, $_) -Color DarkYellow
        return $false
    }
}

function Send-JsonRpcResponse {
    param(
        [System.Net.WebSockets.WebSocket]$Socket,
        [int]$Id,
        [bool]$Ok,
        [string]$ErrorMessage,
        $ResultPayload
    )

    # Escape any string so we can safely inline it into JSON.
    $escapeString = {
        param([string]$Value)
        if ($null -eq $Value) { return 'null' }
        return ($Value | ConvertTo-Json -Depth 2 -Compress).Trim()
    }

    # Build explicit JSON so payload depth warnings never appear for responses.
    if (-not $Ok) {
        # JSON-RPC error responses include code + message.
        $messageJson = & $escapeString $ErrorMessage
        $json = "{`"jsonrpc`":`"2.0`",`"id`":$Id,`"error`":{`"code`":-32603,`"message`":$messageJson}}"
    } else {
        # JSON-RPC ok responses echo the saved file name.
        $savedAs = $null
        if ($ResultPayload -is [System.Collections.IDictionary]) {
            $savedAs = $ResultPayload['savedAs']
        }
        $savedAsJson = & $escapeString ([string]$savedAs)
        $json = "{`"jsonrpc`":`"2.0`",`"id`":$Id,`"result`":{`"ok`":true,`"savedAs`":$savedAsJson}}"
    }

    # Send the response as a text frame.
    Send-WebSocketText -Socket $Socket -Text $json | Out-Null
}

function Send-RslResponse {
    param(
        [System.Net.WebSockets.WebSocket]$Socket,
        [int]$Id,
        [bool]$Ok,
        [string]$ErrorMessage,
        $Payload
    )

    # Escape any string so we can safely inline it into JSON.
    $escapeString = {
        param([string]$Value)
        if ($null -eq $Value) { return 'null' }
        return ($Value | ConvertTo-Json -Depth 2 -Compress).Trim()
    }

    # Normalize booleans to JSON literals.
    $okJson = if ($Ok) { 'true' } else { 'false' }
    # Default payload to an empty object to keep the schema stable.
    $payloadJson = '{}'
    if ($Ok) {
        # Ok responses only include the saved filename.
        $savedAs = $null
        if ($Payload -is [System.Collections.IDictionary]) {
            $savedAs = $Payload['savedAs']
        }
        $savedAsJson = & $escapeString ([string]$savedAs)
        $payloadJson = "{`"savedAs`":$savedAsJson}"
    }

    # Build the response envelope without ConvertTo-Json warnings.
    if ($Ok) {
        $json = "{`"id`":$Id,`"type`":`"res`",`"ok`":$okJson,`"payload`":$payloadJson}"
    } else {
        $errorJson = & $escapeString $ErrorMessage
        $json = "{`"id`":$Id,`"type`":`"res`",`"ok`":$okJson,`"error`":$errorJson,`"payload`":$payloadJson}"
    }

    # Send the response as a text frame.
    Send-WebSocketText -Socket $Socket -Text $json | Out-Null
}

function Build-ProtocolEventBody {
    param(
        [string]$Name,
        $Payload
    )

    # Keep the envelope format centralized so events stay consistent.
        if ($protocolMode -eq 'helper') {
        return @{ type = 'evt'; name = $Name; payload = $Payload }
    }
    return @{ jsonrpc = '2.0'; method = $Name; params = $Payload }
}

function Send-ProtocolEventToSocket {
    param(
        [System.Net.WebSockets.WebSocket]$Socket,
        [string]$Name,
        $Payload
    )

    # Ignore sockets that are already closed.
    if (-not $Socket -or $Socket.State -ne [System.Net.WebSockets.WebSocketState]::Open) {
        return $false
    }

    # Build the envelope once so logging and sending match the same payload.
    $body = Build-ProtocolEventBody -Name $Name -Payload $Payload
    # Serialize with the shared depth to avoid truncated event payloads.
    $json = $body | ConvertTo-Json -Depth $script:WsJsonDepth

    if (Send-WebSocketText -Socket $Socket -Text $json) {
        Write-LogOutbound -Message "evt $Name"
        return $true
    }
    return $false
}

function Send-ProtocolEvent {
    param(
        [string]$Name,
        $Payload
    )

    $clients = Get-WsClientsSnapshot
    foreach ($client in $clients) {
        $socket = $client.Socket
        if (-not $socket -or $socket.State -ne [System.Net.WebSockets.WebSocketState]::Open) {
            Remove-WsClient -Client $client
            continue
        }

        # Reuse the shared formatter so broadcast and single-send stay aligned.
        Send-ProtocolEventToSocket -Socket $socket -Name $Name -Payload $Payload | Out-Null
    }
}
#endregion

#region === Sellfile helpers ===
function Resolve-UploadTargetPath {
    param(
        [string]$RequestedName,
        [string]$OutputPath
    )

    # Default to the configured OutputPath when no name is supplied.
    if ([string]::IsNullOrWhiteSpace($RequestedName)) {
        return $OutputPath
    }

    # Sanitize the filename so it is safe for local disk usage.
    $safeName = [System.Text.RegularExpressions.Regex]::Replace(
        $RequestedName.Trim(),
        '[^a-z0-9_.-]',
        '-',
        [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
    )

    if (-not $safeName.EndsWith('.hsf', [System.StringComparison]::OrdinalIgnoreCase)) {
        $safeName = $safeName + '.hsf'
    }

    $baseDirectory = Split-Path -Parent $OutputPath
    if ([string]::IsNullOrWhiteSpace($baseDirectory)) {
        $baseDirectory = (Get-Location).ProviderPath
    }

    return (Join-Path $baseDirectory $safeName)
}

function Save-SellfilePayload {
    param(
        [string]$PayloadText,
        [string]$FileName
    )

    $targetPath = Resolve-UploadTargetPath -RequestedName $FileName -OutputPath $OutputPath
    $targetDirectory = Split-Path -Parent $targetPath
    if ($targetDirectory -and -not (Test-Path $targetDirectory)) {
        New-Item -ItemType Directory -Path $targetDirectory -Force | Out-Null
    }

    [System.IO.File]::WriteAllText($targetPath, $PayloadText, [System.Text.Encoding]::UTF8)

    $fileInfo = [System.IO.FileInfo]::new($targetPath)
    $displayPath = Get-RelativePathDisplay -Path $fileInfo.FullName
    Write-Log -Message "Saved sellfile payload ($($fileInfo.Length) bytes) to $displayPath" -Color Green

    return $fileInfo.Name
}
#endregion

#region === WebSocket request handlers ===
function Handle-JsonRpcRequest {
    param(
        [System.Net.WebSockets.WebSocket]$Socket,
        [hashtable]$Message
    )

    $idValue = $Message.id
    if (-not ($idValue -is [int] -or $idValue -is [long])) { return }
    $id = [int]$idValue

    $method = $Message.method
    if (-not ($method -is [string]) -or [string]::IsNullOrWhiteSpace($method)) { return }

    if ($method -eq 'uploadSellfile') {
        $params = $Message.params
        if (-not ($params -is [System.Collections.IDictionary])) {
            Send-JsonRpcResponse -Socket $Socket -Id $id -Ok $false -ErrorMessage 'Invalid params' -ResultPayload $null
            return
        }

        $name = $params.name
        $data = $params.data
        if (-not ($data -is [string])) {
            Send-JsonRpcResponse -Socket $Socket -Id $id -Ok $false -ErrorMessage 'Missing data' -ResultPayload $null
            return
        }

        try {
            $savedAs = Save-SellfilePayload -PayloadText $data -FileName ([string]$name)
        }
        catch {
            Write-Log -Message ("uploadSellfile write failed (bytes={0}): {1}" -f $data.Length, $_) -Color DarkYellow
            throw
        }
        $result = @{ ok = $true; savedAs = $savedAs }
        Send-JsonRpcResponse -Socket $Socket -Id $id -Ok $true -ErrorMessage $null -ResultPayload $result
        Write-LogOutbound -Message "res uploadSellfile ok (jsonrpc)"
        return
    }

    Send-JsonRpcResponse -Socket $Socket -Id $id -Ok $false -ErrorMessage 'Method not found' -ResultPayload $null
}

function Handle-RslRequest {
    param(
        [System.Net.WebSockets.WebSocket]$Socket,
        [hashtable]$Message
    )

    $idValue = $Message.id
    if (-not ($idValue -is [int] -or $idValue -is [long])) { return }
    $id = [int]$idValue

    $cmd = $Message.cmd
    if (-not ($cmd -is [string]) -or [string]::IsNullOrWhiteSpace($cmd)) { return }

    if ($cmd -eq 'uploadSellfile') {
        $payload = $Message.payload
        if (-not ($payload -is [System.Collections.IDictionary])) {
            Send-RslResponse -Socket $Socket -Id $id -Ok $false -ErrorMessage 'Invalid payload' -Payload @{}
            return
        }

        $name = $payload.name
        $data = $payload.data
        if (-not ($data -is [string])) {
            Send-RslResponse -Socket $Socket -Id $id -Ok $false -ErrorMessage 'Missing data' -Payload @{}
            return
        }

        try {
            $savedAs = Save-SellfilePayload -PayloadText $data -FileName ([string]$name)
        }
        catch {
            Write-Log -Message ("uploadSellfile write failed (bytes={0}): {1}" -f $data.Length, $_) -Color DarkYellow
            throw
        }
        $result = @{ savedAs = $savedAs }
        Send-RslResponse -Socket $Socket -Id $id -Ok $true -ErrorMessage $null -Payload $result
        Write-LogOutbound -Message "res uploadSellfile ok (helper)"
        return
    }

    Send-RslResponse -Socket $Socket -Id $id -Ok $false -ErrorMessage 'Unknown cmd' -Payload @{}
}

function Handle-ClientMessage {
    param(
        [System.Net.WebSockets.WebSocket]$Socket,
        [string]$Text
    )

    if ([string]::IsNullOrWhiteSpace($Text)) { return }
    $parsed = $null
    try {
        $parsed = $Text | ConvertFrom-Json -Depth 20 -AsHashtable
    } catch {
        Write-Log -Message ("Failed to parse WebSocket JSON ({0} chars): {1}" -f $Text.Length, $_) -Color DarkYellow
        return
    }

    if (-not ($parsed -is [System.Collections.IDictionary])) { return }

    if ($protocolMode -eq 'helper') {
        $typeValue = $parsed.type
        if ($typeValue -is [string] -and $typeValue.ToLowerInvariant() -eq 'req') {
            Write-LogInbound -Message "req $($parsed.cmd)"
            Handle-RslRequest -Socket $Socket -Message $parsed
        }
        return
    }

    if ($parsed.jsonrpc -eq '2.0' -and $parsed.method) {
        Write-LogInbound -Message "req $($parsed.method)"
        Handle-JsonRpcRequest -Socket $Socket -Message $parsed
        return
    }

    Write-Log -Message ("Ignored WebSocket payload (protocolMode={0}; keys={1})" -f $protocolMode, (($parsed.Keys | Sort-Object) -join ',')) -Color DarkYellow
}
#endregion

#region === WebSocket receive loop ===
function Start-WebSocketReceiveLoop {
    param(
        [System.Collections.IDictionary]$Client
    )

    if (-not $Client) { return }
}
#endregion

#region === WebSocket receive polling ===
function Poll-WsClientReceive {
    param([System.Collections.IDictionary]$Client)

    if (-not $Client) { return }
    $socket = $Client.Socket
    $task = $Client.ReceiveTask
    if (-not $task) {
        # Schedule the first receive without blocking the main loop.
        if (-not $socket) {
            Remove-WsClient -Client $Client
            return
        }
        if ($socket.State -ne [System.Net.WebSockets.WebSocketState]::Open) {
            return
        }
        # Only one outstanding ReceiveAsync is allowed per socket.
        try {
            $Client.ReceiveTask = $socket.ReceiveAsync($Client.ReceiveSegment, [System.Threading.CancellationToken]::None)
        } catch {
            Remove-WsClient -Client $Client
            return
        }
        return
    }

    if (-not $task.IsCompleted) { return }

    # Drain multiple completed receives to keep large uploads within timeouts.
    $drainCount = 0
    while ($task -and $task.IsCompleted) {
        $result = $null
        try {
            $result = $task.GetAwaiter().GetResult()
        } catch {
            Remove-WsClient -Client $Client
            return
        }
        # Clear only after completion so we never overlap ReceiveAsync.
        $Client.ReceiveTask = $null

        if ($result.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Close) {
            Remove-WsClient -Client $Client
            return
        }

        if ($result.Count -gt 0) {
            $chunk = [System.Text.Encoding]::UTF8.GetString($Client.ReceiveBuffer, 0, $result.Count)
            [void]$Client.ReceiveBuilder.Append($chunk)
            # Track progress to diagnose large uploads.
            $Client.ReceiveBytes += $result.Count
            if ($Client.ReceiveBytes -ge $Client.ReceiveNextLog) {
                $Client.ReceiveNextLog += 1048576
            }
        }

        if ($result.EndOfMessage) {
            $text = $Client.ReceiveBuilder.ToString()
            $Client.ReceiveBuilder.Clear() | Out-Null
            # Reset counters after each complete message.
            $Client.ReceiveBytes = 0
            $Client.ReceiveNextLog = 1048576
            Handle-ClientMessage -Socket $socket -Text $text
        }

        # Schedule the next receive without blocking.
        if (-not $socket) {
            Remove-WsClient -Client $Client
            return
        }

        $state = $socket.State
        if ($state -eq [System.Net.WebSockets.WebSocketState]::Open) {
            # Start the next receive for this client.
            try {
                $Client.ReceiveTask = $socket.ReceiveAsync($Client.ReceiveSegment, [System.Threading.CancellationToken]::None)
            } catch {
                Remove-WsClient -Client $Client
                return
            }
        } elseif ($state -eq [System.Net.WebSockets.WebSocketState]::Connecting) {
            return
        } else {
            # Capture close details so abort reasons are visible in logs.
            $closeStatus = $socket.CloseStatus
            $closeDescription = $socket.CloseStatusDescription
            Remove-WsClient -Client $Client
            return
        }

        # Stop draining after a bounded number of chunks to stay responsive.
        $task = $Client.ReceiveTask
        $drainCount += 1
        if ($drainCount -ge $script:WsReceiveDrainLimit) { break }
        if (-not $task -or -not $task.IsCompleted) { break }
    }
}

function Poll-WsClientsReceive {
    $clients = Get-WsClientsSnapshot
    foreach ($client in $clients) {
        Poll-WsClientReceive -Client $client
    }
}

function Sync-PendingGearDbSnapshots {
    # Exit early when no sync is needed.
    if (-not $script:NeedsGearDbSync) { return }

    $clients = Get-WsClientsSnapshot
    if (-not $clients -or $clients.Count -eq 0) { return }

    $payload = $script:LastGearDbFilePayload
    if ($payload) {
        # Send the cached payload to any newly connected client.
        foreach ($client in $clients) {
            if (-not $client.NeedsGearDbSync) { continue }
            $socket = $client.Socket
            if (-not $socket -or $socket.State -ne [System.Net.WebSockets.WebSocketState]::Open) {
                Remove-WsClient -Client $client
                continue
            }
            if (Send-ProtocolEventToSocket -Socket $socket -Name 'gearDbFile' -Payload $payload) {
                $client.NeedsGearDbSync = $false
            }
        }
        # Clear the global flag when no clients need a sync anymore.
        $pending = $false
        foreach ($client in $clients) {
            if ($client.NeedsGearDbSync) { $pending = $true; break }
        }
        if (-not $pending) { $script:NeedsGearDbSync = $false }
        return
    }

    # If no payload is cached, force a read after a short cooldown.
    if (-not $script:GearDbWatchState) { return }
    $now = [DateTime]::UtcNow
    if ($now -lt $script:NextGearDbSyncUtc) { return }
    if (Invoke-ForcedGearDbSnapshot -State $script:GearDbWatchState) {
        $script:NeedsGearDbSync = $false
        foreach ($client in $clients) {
            $client.NeedsGearDbSync = $false
        }
        $script:NextGearDbSyncUtc = [DateTime]::MinValue
        return
    }
    $script:NextGearDbSyncUtc = $now.AddMilliseconds(1000)
}
#endregion

#region === Demo payloads ===
$script:GearDbRawSnapshotExample = @'
{
  "payloadVersion": 1,
  "snapshotId": "demo-raw-db",
  "artifacts": [
    {
      "ID": 4010203,
      "price": 0,
      "rank": 6,
      "type": 5,
      "lvl": 16,
      "mid": 2,
      "mfl": 1,
      "mlvl": 12,
      "mlvlid": 75161927680,
      "mgv": 0,
      "s1id": 4,
      "s1lvl": 2,
      "s1fl": 1,
      "s1lvlid": 16492674420,
      "s1gv": 0,
      "s1mlvlid": 0,
      "s2id": 7,
      "s2lvl": 1,
      "s2fl": 0,
      "s2lvlid": 5153960760,
      "s2gv": 1288490188,
      "s2mlvlid": 0,
      "s3id": 8,
      "s3lvl": 2,
      "s3fl": 0,
      "s3lvlid": 9448928050,
      "s3gv": 0,
      "s3mlvlid": 0,
      "s4id": 0,
      "s4lvl": 0,
      "s4fl": 0,
      "s4lvlid": 0,
      "s4gv": 0,
      "s4mlvlid": 0,
      "rarity": 6,
      "aset": 8,
      "accset": 0,
      "ss": 0,
      "cID": 0,
      "sumHP": 0,
      "sumATK": 0,
      "sumDEF": 0,
      "sumSPD": 0,
      "sumCQuote": 0,
      "sumCDMG": 0,
      "sumRES": 0,
      "sumACC": 0,
      "ASCID": 0,
      "ASCLVL": 0,
      "ASCFL": 0,
      "ASCLVLID": 0,
      "ASCGV": 0,
      "ASCLEVEL": 0,
      "REROLLCOUNT": 0
    }
  ],
  "inboxArtifacts": [],
  "champions": [
    { "ID": 777001, "Name": "Arbiter", "Vault": 0, "RVault": 0, "BaseHeroID": 99001, "Rarity": 5 }
  ],
  "lastUsed": [
    { "id": 4010203, "lastUse": "2024-05-08 14:33:27.123" }
  ]
}
'@

#endregion

#region === Demo shortcuts ===
$script:DemoState = [ordered]@{
    SelectSamples        = @(5, 10, 15, 20, 25, 30, 35, 40)
    Random               = [System.Random]::new()
    SampleSnapshotPrimed = $false
    SampleGearAdded      = $false
}

function Get-RandomSelectSample {
    $state = $script:DemoState
    $samples = $state.SelectSamples
    if (-not $samples -or $samples.Count -eq 0) {
        return [pscustomobject]@{ Index = 1; RowNumber = 1 }
    }

    $idx = $state.Random.Next(0, $samples.Count)
    $rowNumber = [int]$samples[$idx]
    return [pscustomobject]@{
        Index     = $idx + 1
        RowNumber = [Math]::Max(1, $rowNumber)
    }
}

function Queue-SampleSelectRule {
    $sample = Get-RandomSelectSample
    $payload = @{ rowNumber = $sample.RowNumber }
    Send-ProtocolEvent -Name 'selectRule' -Payload $payload
    Write-Log -Message ("Queued selectRule sample ##{0} -> row {1}" -f $sample.Index, $sample.RowNumber) -Color DarkGray
}

function Get-SampleGearSnapshotPayload {
    try {
        return $script:GearDbRawSnapshotExample | ConvertFrom-Json -AsHashtable
    } catch {
        Write-Log -Message ("Failed to parse sample snapshot JSON: {0}" -f $_) -Color DarkYellow
        return $null
    }
}

function Build-BaseSnapshotPayload {
    param([System.Collections.IDictionary]$SamplePayload)

    if (-not $SamplePayload) { return $null }
    return [ordered]@{
        payloadVersion = $SamplePayload.payloadVersion
        snapshotId     = $SamplePayload.snapshotId
        artifacts      = @()
        inboxArtifacts = @()
        champions      = @()
        lastUsed       = @()
    }
}

function Build-SampleGearDeltaPayload {
    param(
        [System.Collections.IDictionary]$SamplePayload,
        [switch]$Add
    )

    if (-not $SamplePayload) { return $null }
    $artifactRows = @($SamplePayload.artifacts)
    if (-not $artifactRows -or $artifactRows.Count -lt 1) { return $null }
    $artifactRow = $artifactRows[0]
    if (-not $artifactRow) { return $null }
    $artifactId = $artifactRow.ID
    if (-not $artifactId) { return $null }

    $op = if ($Add) {
        [ordered]@{ op = 'upsert'; table = 'Artifacts'; row = $artifactRow }
    } else {
        [ordered]@{ op = 'remove'; table = 'Artifacts'; id = [int]$artifactId }
    }

    return [ordered]@{
        payloadVersion = $SamplePayload.payloadVersion
        snapshotId     = $SamplePayload.snapshotId
        ops            = @($op)
    }
}

function Ensure-SampleSnapshotPrimed {
    $state = $script:DemoState
    if ($state.SampleSnapshotPrimed) { return $true }
    $sample = Get-SampleGearSnapshotPayload
    if (-not $sample) { return $false }
    $baseSnapshot = Build-BaseSnapshotPayload -SamplePayload $sample
    if (-not $baseSnapshot) { return $false }
    Send-ProtocolEvent -Name 'gearDbRawSnapshot' -Payload $baseSnapshot
    $state.SampleSnapshotPrimed = $true
    $state.SampleGearAdded = $false
    Write-Log -Message 'Queued base gearDbRawSnapshot for sample gear toggles' -Color DarkGray
    return $true
}

function Toggle-SampleGearDelta {
    $state = $script:DemoState
    if (-not (Ensure-SampleSnapshotPrimed)) { return }
    $sample = Get-SampleGearSnapshotPayload
    if (-not $sample) { return }

    $shouldAdd = -not $state.SampleGearAdded
    $deltaPayload = Build-SampleGearDeltaPayload -SamplePayload $sample -Add:$shouldAdd
    if (-not $deltaPayload) {
        Write-Log -Message 'Failed to build sample gear delta payload.' -Color DarkYellow
        return
    }

    Send-ProtocolEvent -Name 'gearDbRawDelta' -Payload $deltaPayload
    $state.SampleGearAdded = $shouldAdd
    $label = if ($shouldAdd) { 'add' } else { 'remove' }
    Write-Log -Message ("Queued gearDbRawDelta sample ({0})" -f $label) -Color DarkGray
}

function Poll-ShortcutInput {
    param([System.Threading.CancellationTokenSource]$TokenSource)

    $handled = $false
    while ([System.Console]::KeyAvailable) {
        $handled = $true
        $keyInfo = [System.Console]::ReadKey($true)
        $modifiers = $keyInfo.Modifiers

        if ((($modifiers -band [System.ConsoleModifiers]::Control) -ne 0) -and $keyInfo.Key -eq [System.ConsoleKey]::C) {
            Write-Log -Message 'Shortcut loop observed Ctrl+C; requesting shutdown.' -Color DarkGray
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
                $page = Get-VisibleLogRowCapacity
                Adjust-LogScrollOffset -Delta $page
                continue
            }
            ([System.ConsoleKey]::PageDown) {
                $page = Get-VisibleLogRowCapacity
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
            ([System.ConsoleKey]::R) {
                Write-Log -Message 'Shortcut detected: R' -Color DarkGray
                Queue-SampleSelectRule
                continue
            }
            ([System.ConsoleKey]::T) {
                Write-Log -Message 'Shortcut detected: T (toggle sample gear)' -Color DarkGray
                Toggle-SampleGearDelta
                continue
            }
            ([System.ConsoleKey]::F) {
                Write-Log -Message 'Shortcut detected: F (force DB snapshot)' -Color DarkGray
                if (-not (Invoke-ForcedGearDbSnapshot -State $script:GearDbWatchState)) {
                    Write-Log -Message 'Force snapshot failed; ensure the DB watcher is active.' -Color DarkYellow
                }
                continue
            }
            default { continue }
        }
    }

    return $handled
}
#endregion

#region === Protocol quick reference ===
function Write-ProtocolQuickReference {
    <#
        Prints a terse cheatsheet so developers can see the WS message shape
        without reading the entire file.
    #>
    $reqLabel = 'req uploadSellfile'.PadRight(22)
    $evtLabel = 'evt selectRule'.PadRight(22)
    $gearLabel = 'evt gearDb*'.PadRight(22)

    Write-ConsoleHeader -Message (New-ConsoleSegmentLine -Segments @(
            @{ Text = '--- Sellfile Creator WebSocket quick reference --- '; Color = [ConsoleColor]::DarkCyan }
            @{ Text = '[inbound] '; Color = [ConsoleColor]::Cyan }
            @{ Text = '[outbound]'; Color = [ConsoleColor]::Magenta }
        ))

    Write-ConsoleHeader -Message (New-ConsoleSegmentLine -Segments @(
            @{ Text = $reqLabel; Color = [ConsoleColor]::Cyan }
            @{ Text = 'send JSON over WebSocket, '; Color = [ConsoleColor]::Gray }
            @{ Text = 'receive res ok/error'; Color = [ConsoleColor]::Magenta }
        ))

    Write-ConsoleHeader -Message (New-ConsoleSegmentLine -Segments @(
            @{ Text = $evtLabel; Color = [ConsoleColor]::Magenta }
            @{ Text = 'focus a preview row (rowNumber)'; Color = [ConsoleColor]::Gray }
        ))

    Write-ConsoleHeader -Message (New-ConsoleSegmentLine -Segments @(
            @{ Text = $gearLabel; Color = [ConsoleColor]::Magenta }
            @{ Text = 'raw snapshot/delta + base64 DB payloads'; Color = [ConsoleColor]::Gray }
        ))
}
#endregion

#region === Gear DB watcher ===
function Get-DefaultGearDbDirectory {
    $appData = $env:APPDATA
    if ([string]::IsNullOrWhiteSpace($appData)) {
        try { $appData = [Environment]::GetFolderPath('ApplicationData') } catch { $appData = $null }
    }
    if ([string]::IsNullOrWhiteSpace($appData)) { return $null }
    return (Join-Path $appData 'RslHelper\Config')
}

function Select-GearDbFileFromDirectory {
    param([string]$Directory)

    if (-not (Test-Path -LiteralPath $Directory)) {
        Write-Log -Message "Gear DB directory '$Directory' was not found." -Color DarkYellow
        return $null
    }

    try {
        $files = @(Get-ChildItem -LiteralPath $Directory -Filter '*.db' -File | Sort-Object LastWriteTime -Descending)
    }
    catch {
        Write-Log -Message ("Failed to enumerate DB files under '{0}': {1}" -f $Directory, $_) -Color DarkYellow
        return $null
    }

    if (-not $files -or $files.Count -eq 0) {
        Write-Log -Message ("No .db files were found under '{0}'." -f $Directory) -Color DarkYellow
        return $null
    }

    if ($files.Count -eq 1) {
        return $files[0].FullName
    }

    Write-ConsoleHeader -Message ("Multiple RSL Helper DB files found in {0}" -f $Directory) -Color Yellow
    for ($idx = 0; $idx -lt $files.Count; $idx++) {
        $file = $files[$idx]
        $displayIndex = $idx + 1
        $modified = $file.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss')
        $sizeDisplay = '{0:N0} bytes' -f [long]$file.Length
        Write-Host ("[{0}] {1} - {2}, modified {3}" -f $displayIndex, $file.Name, $sizeDisplay, $modified)
    }

    while ($true) {
        $selection = Read-Host 'Select a DB file by number (Enter to cancel)'
        if ([string]::IsNullOrWhiteSpace($selection)) {
            Write-Log -Message 'Gear DB watcher setup cancelled.' -Color DarkYellow
            return $null
        }

        $parsed = 0
        if ([int]::TryParse($selection, [ref]$parsed)) {
            if ($parsed -ge 1 -and $parsed -le $files.Count) {
                return $files[$parsed - 1].FullName
            }
        }

        Write-Log -Message 'Invalid selection. Please enter one of the listed numbers.' -Color DarkYellow
    }
}

function Resolve-GearDbWatchPath {
    param([string]$RequestedPath)

    $candidate = $RequestedPath
    if ([string]::IsNullOrWhiteSpace($candidate)) {
        $candidate = Get-DefaultGearDbDirectory
        if ([string]::IsNullOrWhiteSpace($candidate)) {
            Write-Log -Message 'Unable to determine %APPDATA% for the default RSL Helper path.' -Color DarkYellow
            return $null
        }
        return Select-GearDbFileFromDirectory -Directory $candidate
    }

    $expanded = [Environment]::ExpandEnvironmentVariables($candidate)
    if (Test-Path -LiteralPath $expanded) {
        try { $item = Get-Item -LiteralPath $expanded -ErrorAction Stop } catch { $item = $null }
        if ($item -and $item.PSIsContainer) {
            return Select-GearDbFileFromDirectory -Directory $item.FullName
        }
        if ($item) {
            return $item.FullName
        }
    }

    if ($expanded.EndsWith('.db', [System.StringComparison]::OrdinalIgnoreCase)) {
        $directory = Split-Path -Parent $expanded
        if (-not (Test-Path -LiteralPath $directory)) {
            Write-Log -Message ("Directory '{0}' does not exist for gear DB path '{1}'." -f $directory, $expanded) -Color DarkYellow
            return $null
        }
        return [System.IO.Path]::GetFullPath($expanded)
    }

    if (Test-Path -LiteralPath $expanded) {
        try { return (Resolve-Path -LiteralPath $expanded).Path } catch { return $null }
    }

    Write-Log -Message ("Gear DB path '{0}' was not found." -f $expanded) -Color DarkYellow
    return $null
}

function New-GearDbWatchState {
    param([string]$FullPath)

    if ([string]::IsNullOrWhiteSpace($FullPath)) { return $null }
    $directory = Split-Path -Parent $FullPath
    if (-not $directory) {
        Write-Log -Message ("Unable to determine directory for gear DB path '{0}'." -f $FullPath) -Color DarkYellow
        return $null
    }
    if (-not (Test-Path -LiteralPath $directory)) {
        Write-Log -Message ("Gear DB directory '{0}' does not exist." -f $directory) -Color DarkYellow
        return $null
    }

    return [ordered]@{
        FullPath              = [System.IO.Path]::GetFullPath($FullPath)
        Directory             = $directory
        FileName              = Split-Path -Leaf $FullPath
        PollIntervalMs        = 2000
        NextPollUtc           = [DateTime]::UtcNow.AddMilliseconds(-250)
        LastSignature         = $null
        MissingLogged         = $false
        LastReadErrorLogged   = $false
        InvalidHeaderLogged   = $false
        WriteInProgressLogged = $false
    }
}

function Read-FileBytesWithRetry {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [int]$Attempts = 8,
        [int]$DelayMilliseconds = 250
    )

    $lastError = $null
    for ($attempt = 0; $attempt -lt [Math]::Max(1, $Attempts); $attempt++) {
        try {
            $fileStream = [System.IO.File]::Open($Path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
            try {
                $memory = New-Object System.IO.MemoryStream
                try {
                    $fileStream.CopyTo($memory)
                    return $memory.ToArray()
                }
                finally {
                    $memory.Dispose()
                }
            }
            finally {
                $fileStream.Dispose()
            }
        }
        catch {
            $lastError = $_
            if ($DelayMilliseconds -gt 0) {
                Start-Sleep -Milliseconds $DelayMilliseconds
            }
        }
    }

    if ($lastError) { throw $lastError }
    throw "Failed to read file '$Path'."
}

function Test-IsSqliteDatabaseBytes {
    param([byte[]]$Bytes)

    if (-not $Bytes) { return $false }
    if ($Bytes.Length -lt 16) { return $false }
    try {
        $header = [System.Text.Encoding]::ASCII.GetString($Bytes, 0, 15)
    }
    catch {
        return $false
    }
    if ($header -ne 'SQLite format 3') { return $false }
    return ($Bytes[15] -eq 0)
}

function Invoke-GearDbWatchTick {
    param(
        [System.Collections.IDictionary]$State
    )

    if (-not $State) { return }

    $now = [DateTime]::UtcNow
    if ($now -lt $State.NextPollUtc) { return }
    $State.NextPollUtc = $now.AddMilliseconds($State.PollIntervalMs)

    $fullPath = $State.FullPath
    if (-not (Test-Path -LiteralPath $fullPath)) {
        if (-not $State.MissingLogged) {
            Write-Log -Message ("Gear DB file '{0}' not found yet; waiting for it to be created." -f $State.FileName) -Color DarkYellow
            $State.MissingLogged = $true
        }
        return
    }

    if ($State.MissingLogged) {
        Write-Log -Message ("Detected gear DB file '{0}'. Watching for changes." -f $State.FileName) -Color DarkGray
        $State.MissingLogged = $false
    }

    $fileInfo = $null
    try {
        $fileInfo = Get-Item -LiteralPath $fullPath -ErrorAction Stop
    }
    catch {
        if (-not $State.LastReadErrorLogged) {
            Write-Log -Message ("Unable to inspect gear DB '{0}': {1}" -f $State.FileName, $_) -Color DarkYellow
            $State.LastReadErrorLogged = $true
        }
        return
    }

    $signature = '{0}:{1}' -f ([long]$fileInfo.Length), $fileInfo.LastWriteTimeUtc.Ticks
    if ($State.LastSignature -eq $signature) { return }

    $age = $now - $fileInfo.LastWriteTimeUtc
    if ($age.TotalMilliseconds -lt 500) {
        if (-not $State.WriteInProgressLogged) {
            Write-Log -Message ("Gear DB file '{0}' is still being written; waiting before reading." -f $State.FileName) -Color DarkGray
            $State.WriteInProgressLogged = $true
        }
        return
    }
    $State.WriteInProgressLogged = $false

    $bytes = $null
    try {
        $bytes = Read-FileBytesWithRetry -Path $fullPath
    }
    catch {
        if (-not $State.LastReadErrorLogged) {
            Write-Log -Message ("Gear DB watcher could not read '{0}': {1}" -f $State.FileName, $_) -Color DarkYellow
            $State.LastReadErrorLogged = $true
        }
        return
    }

    $State.LastReadErrorLogged = $false

    if (-not (Test-IsSqliteDatabaseBytes -Bytes $bytes)) {
        if (-not $State.InvalidHeaderLogged) {
            Write-Log -Message ("Gear DB watcher read an incomplete file for '{0}'; waiting for the write to finish." -f $State.FileName) -Color DarkYellow
            $State.InvalidHeaderLogged = $true
        }
        return
    }
    $State.InvalidHeaderLogged = $false

    $base64 = [Convert]::ToBase64String($bytes)
    $payload = [ordered]@{
        name   = $State.FileName
        base64 = $base64
    }

    # Store the payload so future clients receive the latest DB snapshot.
    $script:LastGearDbFilePayload = $payload

    Send-ProtocolEvent -Name 'gearDbFile' -Payload $payload
    $State.LastSignature = $signature
    Write-Log -Message ("Queued gear DB update from {0} ({1:N0} bytes)" -f $State.FileName, [long]$bytes.Length) -Color Cyan
}

function Invoke-ForcedGearDbSnapshot {
    <#
        Forces a gear DB payload emission without waiting for file changes.
    #>
    param(
        [System.Collections.IDictionary]$State
    )

    # Exit early if the watcher is not configured.
    if (-not $State) {
        Write-Log -Message 'Force snapshot skipped: gear DB watcher is disabled.' -Color DarkYellow
        return $false
    }

    $fullPath = $State.FullPath
    # Validate the DB path before attempting to read it.
    if (-not (Test-Path -LiteralPath $fullPath)) {
        Write-Log -Message ("Force snapshot skipped: '{0}' was not found." -f $State.FileName) -Color DarkYellow
        return $false
    }

    $fileInfo = $null
    # Fetch metadata to log a helpful message and update signatures.
    try {
        $fileInfo = Get-Item -LiteralPath $fullPath -ErrorAction Stop
    }
    catch {
        Write-Log -Message ("Force snapshot failed to inspect '{0}': {1}" -f $State.FileName, $_) -Color DarkYellow
        return $false
    }

    $bytes = $null
    # Always re-read the file so the forced snapshot reflects current contents.
    try {
        $bytes = Read-FileBytesWithRetry -Path $fullPath
    }
    catch {
        Write-Log -Message ("Force snapshot failed to read '{0}': {1}" -f $State.FileName, $_) -Color DarkYellow
        return $false
    }

    # Guard against partial writes by validating the SQLite header.
    if (-not (Test-IsSqliteDatabaseBytes -Bytes $bytes)) {
        Write-Log -Message ("Force snapshot skipped: '{0}' is not a valid SQLite file yet." -f $State.FileName) -Color DarkYellow
        return $false
    }

    $base64 = [Convert]::ToBase64String($bytes)
    # Emit a gearDbFile event that mirrors the watcher payload.
    $payload = [ordered]@{
        name   = $State.FileName
        base64 = $base64
    }

    # Keep the cached payload aligned with the forced snapshot.
    $script:LastGearDbFilePayload = $payload

    Send-ProtocolEvent -Name 'gearDbFile' -Payload $payload
    # Update the signature so the watcher does not immediately resend.
    $State.LastSignature = '{0}:{1}' -f ([long]$fileInfo.Length), $fileInfo.LastWriteTimeUtc.Ticks
    Write-Log -Message ("Forced gear DB snapshot from {0} ({1:N0} bytes)" -f $State.FileName, [long]$bytes.Length) -Color Cyan
    return $true
}
#endregion

#region === Launch helpers ===
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
    # Only encode when whitespace or quotes are present so the URL stays readable.
    $needsEncoding = $Endpoint -match '[\s"'']'
    # Preserve the raw endpoint for standard ws://host:port usage.
    $encoded = if ($needsEncoding) { [System.Uri]::EscapeDataString($Endpoint) } else { $Endpoint }
    return ($indexUri.AbsoluteUri + "?endpoint=$encoded")
}

function Get-DefaultHtmlHandlerExe {
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
            Write-Log -Message ("Failed to launch {0} via {1}: {2}" -f $Url, $browserExe, $_) -Color DarkYellow
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
            Write-Log -Message ("Failed to launch URL {0}: {1}" -f $Url, $_) -Color DarkYellow
        }
    }

    return $false
}
#endregion

#region === Runtime setup & listener loop ===
$indexPathResolved = Resolve-AppEntryPath -Root $AppRoot
$wsEndpoint = "ws://localhost:$Port/"
$launchUrl = New-LaunchUrl -IndexPath $indexPathResolved -Endpoint $wsEndpoint

Reset-ConsoleUi

Write-ConsoleHeader -Message "Launching Sellfile Creator with endpoint $wsEndpoint" -Color Cyan
Write-ConsoleHeader -Message "Launch URL: $launchUrl" -Color DarkGray
Write-ConsoleHeader -Message "Protocol: $protocolMode ($protocolSubprotocol)" -Color DarkGray
Write-ProtocolQuickReference

$script:GearDbWatchState = $null
$resolvedGearDbPath = $null
if ($WatchGearDb -or -not [string]::IsNullOrWhiteSpace($GearDbPath)) {
    $resolvedGearDbPath = Resolve-GearDbWatchPath -RequestedPath $GearDbPath
    if ($resolvedGearDbPath) {
        $script:GearDbWatchState = New-GearDbWatchState -FullPath $resolvedGearDbPath
        if ($script:GearDbWatchState) {
            $dbDisplay = Get-RelativePathDisplay -Path $script:GearDbWatchState.FullPath
            Write-ConsoleHeader -Message ("Watching RSL Helper DB: {0}" -f $dbDisplay) -Color Cyan
        }
    } else {
        Write-ConsoleLog -Message 'Gear DB watcher disabled (no valid path).' -Color DarkYellow
    }
}

if (-not (Open-LaunchUrl -Url $launchUrl)) {
    Write-Error "Failed to launch $launchUrl"
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

$prefix = "http://localhost:$Port/"
$listener.Prefixes.Add($prefix)
try {
    $listener.Start()

    $cwd = (Get-Location).ProviderPath
    $absoluteOutputPath = [System.IO.Path]::GetFullPath($OutputPath, $cwd)
    $relativeOutputDisplay = Get-RelativePathDisplay -Path $absoluteOutputPath

    Write-ConsoleHeader -Message ("Listening on {0} -> saving sellfiles to {1}" -f $prefix, $relativeOutputDisplay) -Color Yellow
    Write-ConsoleHeader -Message 'Shortcuts: [T] queue sample raw gear, [F] force DB snapshot, [R] queue sample selectRule. Press Ctrl+C to stop.' -Color DarkGray

    try { [System.Console]::CancelKeyPress += $cancelHandler } catch {}

    $outputDir = Split-Path -Parent $OutputPath
    if ($outputDir -and -not (Test-Path $outputDir)) {
        New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
    }

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

        # Poll inbound WebSocket frames so uploads are processed without threads.
        Poll-WsClientsReceive
        # Push queued gear DB snapshots to newly connected clients.
        Sync-PendingGearDbSnapshots

        if ($script:GearDbWatchState) {
            Invoke-GearDbWatchTick -State $script:GearDbWatchState
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
            if ($context.Request.IsWebSocketRequest) {
                $requestedProtocols = $context.Request.Headers['Sec-WebSocket-Protocol']
                $selectedProtocol = $null
                if ($requestedProtocols) {
                    $tokens = $requestedProtocols.Split(',') | ForEach-Object { $_.Trim() } | Where-Object { $_ }
                    if ($tokens -contains $protocolSubprotocol) {
                        $selectedProtocol = $protocolSubprotocol
                    }
                }

                try {
                    $wsContext = $context.AcceptWebSocketAsync($selectedProtocol).GetAwaiter().GetResult()
                    $client = Add-WsClient -Socket $wsContext.WebSocket
                    $requestedSummary = if ($requestedProtocols) { $requestedProtocols } else { 'none' }
                    Write-ConsoleLog -Message ("Client connected (protocol: {0}; requested: {1})" -f ($selectedProtocol ?? 'none'), $requestedSummary) -Color DarkGray
                    Start-WebSocketReceiveLoop -Client $client
                    # Send the cached DB payload immediately when available.
                    $sentSnapshot = $false
                    if ($script:LastGearDbFilePayload) {
                        $sentSnapshot = Send-ProtocolEventToSocket -Socket $client.Socket -Name 'gearDbFile' -Payload $script:LastGearDbFilePayload
                    }
                    # If no payload was cached or send failed, queue a retry.
                    if (-not $sentSnapshot) {
                        $client.NeedsGearDbSync = $true
                        $script:NeedsGearDbSync = $true
                    }
                }
                catch {
                    Write-ConsoleLog -Message ("Failed to accept WebSocket: {0}" -f $_) -Color DarkYellow
                    try { $context.Response.StatusCode = 500 } catch {}
                }
            } else {
                try {
                    $context.Response.StatusCode = 426
                    $context.Response.StatusDescription = 'Upgrade Required'
                    $context.Response.Close()
                } catch {}
            }
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
