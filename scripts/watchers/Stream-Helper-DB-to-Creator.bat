@echo off
setlocal ENABLEDELAYEDEXPANSION

REM Stream the live RSL Helper DB into Sellfile Creator without typing commands.
REM Double-click this file to start the db watcher with the defaults that
REM most users expect: it requires PowerShell 7 (pwsh), launches
REM run-db-watcher.ps1 with the gear DB watcher already pointing at
REM %APPDATA%\RslHelper\Config, and still forwards any extra arguments.

set "SCRIPT_DIR=%~dp0"
set "PS_SCRIPT=!SCRIPT_DIR!run-db-watcher.ps1"
REM Pin the app entry file in source control for local dev runs.
REM Build/package tooling can rewrite this value for the target layout.
set "APP_ENTRY_PATH=!SCRIPT_DIR!..\..\dist\index.html"

REM Keep the PowerShell companion script next to this batch file.
if not exist "!PS_SCRIPT!" (
  echo [Stream-Helper] Unable to find PowerShell script: !PS_SCRIPT!
  exit /b 1
)

REM Use the standard RSL Helper config directory unless the caller overrides it.
if "!APPDATA!"=="" (
  echo [Stream-Helper] APPDATA is not defined; cannot resolve the default RSL Helper path.
  exit /b 1
)

set "DEFAULT_DB=!APPDATA!\RslHelper\Config"

REM Require pwsh (PowerShell 7)
where pwsh >nul 2>&1
if not errorlevel 1 (
  set "POWERSHELL_EXE=pwsh"
) else (
  echo [Stream-Helper] PowerShell 7 ^(pwsh^) is required to run this helper.
  echo [Stream-Helper] Download it from https://aka.ms/powershell and run this file again.
  choice /M "Open the PowerShell download page now"
  if errorlevel 2 (
    exit /b 1
  )
  start "" "https://aka.ms/powershell"
  exit /b 1
)

REM Launch the db watcher with watcher defaults and pass through extra args.
"!POWERSHELL_EXE!" -NoProfile -ExecutionPolicy Bypass -File "!PS_SCRIPT!" -AppEntryPath "!APP_ENTRY_PATH!" -WatchGearDb -GearDbPath "!DEFAULT_DB!" %*
set "EXIT_CODE=!ERRORLEVEL"
endlocal & exit /b !EXIT_CODE!
