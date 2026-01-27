[CmdletBinding(DefaultParameterSetName = "ById", SupportsShouldProcess = $true)]
param(
    # Target process by PID when supplied.
    [Parameter(Mandatory = $true, ParameterSetName = "ById")]
    [int]$ProcessId,

    # Target process by name when supplied.
    [Parameter(Mandatory = $true, ParameterSetName = "ByName")]
    [string]$ProcessName,

    # DLL filename to unload (e.g. "example.dll").
    [Parameter(Mandatory = $true)]
    [string]$DllName
)

# Enforce 64-bit PowerShell to match 64-bit target processes.
if (-not [Environment]::Is64BitProcess) {
    throw "Run this script from 64-bit PowerShell to unload 64-bit DLLs."
}

# Normalize the DLL filename so callers can pass a path or a bare name.
$targetDllName = [IO.Path]::GetFileName($DllName)
# Guard against empty or invalid names after normalization.
if ([string]::IsNullOrWhiteSpace($targetDllName)) {
    throw "Provide a DLL filename, such as 'example.dll'."
}

# Resolve the target process using the selected parameter set.
switch ($PSCmdlet.ParameterSetName) {
    "ById" {
        # Use an exact PID lookup for deterministic targeting.
        $process = Get-Process -Id $ProcessId -ErrorAction Stop
    }
    "ByName" {
        # Resolve by name and fail if the name maps to multiple processes.
        $matches = Get-Process -Name $ProcessName -ErrorAction Stop
        if ($matches.Count -gt 1) {
            $ids = ($matches | ForEach-Object { $_.Id }) -join ", "
            throw "Process name '$ProcessName' matched multiple PIDs: $ids"
        }
        $process = $matches
    }
    default {
        # Defensive guard in case a new parameter set is added later.
        throw "Unsupported parameter set '$($PSCmdlet.ParameterSetName)'."
    }
}

# Pull the module list before opening handles so we can report missing DLLs early.
try {
    $modules = $process.Modules
} catch {
    throw "Unable to read modules for PID $($process.Id). Try running PowerShell as Administrator."
}

# Find the module by case-insensitive filename match.
$module = $modules | Where-Object { $_.ModuleName -ieq $targetDllName } | Select-Object -First 1
# Stop if the module is not loaded in the process.
if (-not $module) {
    throw "DLL '$targetDllName' is not loaded in PID $($process.Id)."
}

# Load native helpers once per session to keep the script idempotent.
if (-not ("UnloadDll.NativeMethods" -as [type])) {
    Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

namespace UnloadDll
{
    // Native interop helpers for remote FreeLibrary.
    public static class NativeMethods
    {
        // Access flags required for OpenProcess.
        [Flags]
        public enum ProcessAccess : uint
        {
            // Create a remote thread in the target process.
            CreateThread = 0x0002,
            // Read from the process address space.
            VirtualMemoryRead = 0x0010,
            // Write to the process address space (CreateRemoteThread requirement).
            VirtualMemoryWrite = 0x0020,
            // Perform memory operations in the target process.
            VirtualMemoryOperation = 0x0008,
            // Query process information (needed for WOW64 checks).
            QueryInformation = 0x0400
        }

        // Open a handle to the target process.
        [DllImport("kernel32.dll", SetLastError = true)]
        public static extern IntPtr OpenProcess(ProcessAccess dwDesiredAccess, bool bInheritHandle, int dwProcessId);

        // Close any Win32 handle we create.
        [DllImport("kernel32.dll", SetLastError = true)]
        public static extern bool CloseHandle(IntPtr hObject);

        // Get the base address of kernel32 in the current process.
        [DllImport("kernel32.dll", SetLastError = true)]
        public static extern IntPtr GetModuleHandle(string lpModuleName);

        // Resolve FreeLibrary from kernel32.
        [DllImport("kernel32.dll", SetLastError = true)]
        public static extern IntPtr GetProcAddress(IntPtr hModule, string lpProcName);

        // Create a thread in the target process that calls FreeLibrary.
        [DllImport("kernel32.dll", SetLastError = true)]
        public static extern IntPtr CreateRemoteThread(
            IntPtr hProcess,
            IntPtr lpThreadAttributes,
            UIntPtr dwStackSize,
            IntPtr lpStartAddress,
            IntPtr lpParameter,
            uint dwCreationFlags,
            out uint lpThreadId);

        // Wait for the remote thread to finish.
        [DllImport("kernel32.dll", SetLastError = true)]
        public static extern uint WaitForSingleObject(IntPtr hHandle, uint dwMilliseconds);

        // Read the FreeLibrary return value.
        [DllImport("kernel32.dll", SetLastError = true)]
        public static extern bool GetExitCodeThread(IntPtr hThread, out uint lpExitCode);

        // Detect WOW64 to ensure the target is truly 64-bit.
        [DllImport("kernel32.dll", SetLastError = true)]
        public static extern bool IsWow64Process(IntPtr hProcess, out bool wow64Process);
    }
}
"@
}

# Helper to format Win32 failures with the last error code.
function New-Win32Error {
    param([string]$Action)
    # Capture the Win32 error immediately to avoid clobbering it.
    $code = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
    return "$Action failed with Win32 error $code."
}

# Combine process access flags needed for CreateRemoteThread.
$access = [UnloadDll.NativeMethods+ProcessAccess]::CreateThread `
    -bor [UnloadDll.NativeMethods+ProcessAccess]::VirtualMemoryOperation `
    -bor [UnloadDll.NativeMethods+ProcessAccess]::VirtualMemoryWrite `
    -bor [UnloadDll.NativeMethods+ProcessAccess]::VirtualMemoryRead `
    -bor [UnloadDll.NativeMethods+ProcessAccess]::QueryInformation

# Track native handles so we can always clean up.
$processHandle = [IntPtr]::Zero
$threadHandle = [IntPtr]::Zero

try {
    # Open the target process with required rights.
    $processHandle = [UnloadDll.NativeMethods]::OpenProcess($access, $false, $process.Id)
    if ($processHandle -eq [IntPtr]::Zero) {
        throw (New-Win32Error "OpenProcess")
    }

    # Reject 32-bit targets since the script only supports 64-bit processes.
    $isWow64 = $false
    if (-not [UnloadDll.NativeMethods]::IsWow64Process($processHandle, [ref]$isWow64)) {
        throw (New-Win32Error "IsWow64Process")
    }
    if ($isWow64) {
        throw "PID $($process.Id) is a 32-bit process; use a 32-bit tool instead."
    }

    # Resolve the local address of FreeLibrary in kernel32.
    $kernel32 = [UnloadDll.NativeMethods]::GetModuleHandle("kernel32.dll")
    if ($kernel32 -eq [IntPtr]::Zero) {
        throw (New-Win32Error "GetModuleHandle(kernel32.dll)")
    }
    $freeLibrary = [UnloadDll.NativeMethods]::GetProcAddress($kernel32, "FreeLibrary")
    if ($freeLibrary -eq [IntPtr]::Zero) {
        throw (New-Win32Error "GetProcAddress(FreeLibrary)")
    }

    # Only proceed if the caller confirms the unload operation.
    $targetLabel = "PID $($process.Id) ($($process.ProcessName))"
    if (-not $PSCmdlet.ShouldProcess($targetLabel, "Unload $targetDllName")) {
        return
    }

    # Create a remote thread that calls FreeLibrary with the module handle.
    $threadId = 0
    $threadHandle = [UnloadDll.NativeMethods]::CreateRemoteThread(
        $processHandle,
        [IntPtr]::Zero,
        [UIntPtr]::Zero,
        $freeLibrary,
        $module.BaseAddress,
        0,
        [ref]$threadId
    )
    if ($threadHandle -eq [IntPtr]::Zero) {
        throw (New-Win32Error "CreateRemoteThread")
    }

    # Wait indefinitely for the remote call to complete.
    $waitResult = [UnloadDll.NativeMethods]::WaitForSingleObject($threadHandle, [uint32]::MaxValue)
    if ($waitResult -ne 0) {
        throw (New-Win32Error "WaitForSingleObject")
    }

    # Read the FreeLibrary return value to verify success.
    $exitCode = 0
    if (-not [UnloadDll.NativeMethods]::GetExitCodeThread($threadHandle, [ref]$exitCode)) {
        throw (New-Win32Error "GetExitCodeThread")
    }
    if ($exitCode -eq 0) {
        throw "FreeLibrary returned 0 for '$targetDllName'. The DLL may still be in use."
    }

    # Emit a compact success message for scripting workflows.
    Write-Output "Unloaded '$targetDllName' from PID $($process.Id)."
} finally {
    # Always close the thread handle if it was created.
    if ($threadHandle -ne [IntPtr]::Zero) {
        [void][UnloadDll.NativeMethods]::CloseHandle($threadHandle)
    }
    # Always close the process handle if it was opened.
    if ($processHandle -ne [IntPtr]::Zero) {
        [void][UnloadDll.NativeMethods]::CloseHandle($processHandle)
    }
}
