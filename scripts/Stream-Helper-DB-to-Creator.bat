@echo off
setlocal ENABLEDELAYEDEXPANSION

REM Stream the live RSL Helper DB into Sellfile Creator without typing commands.
REM Double-click this file to start the db watcher with the defaults that
REM most users expect: it finds PowerShell 7 (pwsh) when available, falls back to
REM Windows PowerShell otherwise, and launches run-db-watcher-helper.ps1 with the gear
REM DB watcher already pointing at %APPDATA%\RslHelper\Config. Extra arguments
REM typed after the .bat name still flow through for advanced tinkering.

set "SCRIPT_DIR=%~dp0"
set "PS_SCRIPT=!SCRIPT_DIR!run-db-watcher-helper.ps1"

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

REM Prefer pwsh (PowerShell 7). If unavailable, fall back to Windows PowerShell.
where pwsh >nul 2>&1
if not errorlevel 1 (
  set "POWERSHELL_EXE=pwsh"
) else (
  where powershell >nul 2>&1
  if not errorlevel 1 (
    set "POWERSHELL_EXE=powershell"
  ) else (
    echo "[Stream-Helper] Neither PowerShell 7 (pwsh) nor Windows PowerShell was found on PATH."
    exit /b 1
  )
)

REM Launch the db watcher with watcher defaults and pass through extra args.
"!POWERSHELL_EXE!" -NoProfile -ExecutionPolicy Bypass -File "!PS_SCRIPT!" -DebugLogPath "!SCRIPT_DIR!ws-debug.log" -DisableConsoleUi -SkipInitialGearSync -WatchGearDb -GearDbPath "!DEFAULT_DB!" %*
set "EXIT_CODE=!ERRORLEVEL"
endlocal & exit /b !EXIT_CODE!
