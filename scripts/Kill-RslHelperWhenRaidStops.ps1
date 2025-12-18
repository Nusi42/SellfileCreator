<#  Kill-RslHelperWhenRaidStops.ps1

    Intent:
    - Ensure this script runs with elevated (Administrator) rights; if not, it restarts itself as admin.
    - Start RSL Helper (RSLHelper.exe) and keep it running while the game process (Raid.exe) is present.
    - Once at least one Raid.exe has been observed (started after RSL Helper launch), kill RSL Helper if
      Raid.exe is absent continuously for a configurable grace period (default 5 seconds).

    Notes:
    - This avoids killing RSL Helper due to unrelated Raid.exe instances that started before this script.
    - If RSL Helper exits on its own, the script exits.
#>

[CmdletBinding()]
param(
  [Parameter()]
  [ValidateNotNullOrEmpty()]
  [string]$RslHelperPath = "C:\Program Files\RSL_Helper_V4\RSLHelper.exe",

  [Parameter()]
  [ValidateRange(1, 3600)]
  [int]$NoRaidGraceSeconds = 5,

  [Parameter()]
  [ValidateRange(1, 60)]
  [int]$PollSeconds = 1
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Test-IsAdmin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Quote-Arg {
  param([Parameter(Mandatory = $true)][string]$Value)
  if ($Value -match '[\s"`]') {
    return '"' + ($Value -replace '"', '""') + '"'
  }
  return $Value
}

if (-not (Test-IsAdmin)) {
  $hostExe =
    if ($PSVersionTable.PSEdition -eq "Core") { "pwsh.exe" }
    else { "powershell.exe" }

  $argString = @(
    "-WindowStyle Hidden"
    "-NoProfile"
    "-ExecutionPolicy Bypass"
    "-File $(Quote-Arg $PSCommandPath)"
    "-RslHelperPath $(Quote-Arg $RslHelperPath)"
    "-NoRaidGraceSeconds $NoRaidGraceSeconds"
    "-PollSeconds $PollSeconds"
  ) -join " "

  Start-Process -FilePath $hostExe -Verb RunAs -ArgumentList $argString | Out-Null
  exit
}

if (-not (Test-Path -LiteralPath $RslHelperPath)) {
  throw "RSL Helper not found at: $RslHelperPath"
}

$helperStartTime = Get-Date
$helperProcess = Start-Process -FilePath $RslHelperPath -PassThru

$seenRaid = $false
$lastRaidSeenAt = $null

while ($true) {
  if ($helperProcess.HasExited) {
    break
  }

  $raidProcesses = @(Get-Process -Name "Raid" -ErrorAction SilentlyContinue)

  $recentRaidCount = 0
  foreach ($raidProcess in $raidProcesses) {
    try {
      if ($raidProcess.StartTime -ge $helperStartTime.AddSeconds(-2)) {
        $recentRaidCount += 1
      }
    } catch {
      # Intent: ignore processes where StartTime cannot be read; we only need "any recent Raid.exe".
    }
  }

  if ($recentRaidCount -gt 0) {
    $seenRaid = $true
    $lastRaidSeenAt = Get-Date
  } elseif ($seenRaid -and $lastRaidSeenAt) {
    $secondsSinceLastRaid = ((Get-Date) - $lastRaidSeenAt).TotalSeconds
    if ($secondsSinceLastRaid -ge $NoRaidGraceSeconds) {
      Stop-Process -Id $helperProcess.Id -Force -ErrorAction SilentlyContinue
      break
    }
  }

  Start-Sleep -Seconds $PollSeconds
}

