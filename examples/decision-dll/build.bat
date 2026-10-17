@echo off
REM SPDX-License-Identifier: MIT
REM Builds the example against the decision library.
REM
REM Run this from a Developer Command Prompt, or just double-click it - it looks for
REM a Visual Studio install and sets things up itself.
REM
REM Any C compiler works; this uses the Microsoft one because it comes with Visual
REM Studio and needs nothing else installed.

setlocal

REM Already in a Developer Command Prompt? Then cl is on the path and we are done.
where cl.exe >nul 2>&1
if %ERRORLEVEL%==0 goto build

REM Otherwise find Visual Studio and set up the environment.
set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
if not exist "%VSWHERE%" goto no_compiler

for /f "usebackq tokens=*" %%i in (`"%VSWHERE%" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`) do set "VSPATH=%%i"
if not defined VSPATH goto no_compiler
if not exist "%VSPATH%\VC\Auxiliary\Build\vcvars64.bat" goto no_compiler

call "%VSPATH%\VC\Auxiliary\Build\vcvars64.bat" >nul

:build
cl /nologo /W4 sfc_sample.c /Fe:sfc_sample.exe
if not %ERRORLEVEL%==0 (
  echo.
  echo Build failed - see the messages above.
  REM Report the failure in the exit code too, so chaining this from a script or a build
  REM step stops here instead of running a stale exe.
  exit /b 1
)
echo.
echo Built sfc_sample.exe
echo.
echo Run it with the library beside it, or give it a path:
echo   sfc_sample.exe path\to\sfc_engine.dll
exit /b 0

:no_compiler
echo Could not find a C compiler.
echo.
echo Install the free Visual Studio Community edition and pick the
echo "Desktop development with C++" option, then run this again.
exit /b 1
