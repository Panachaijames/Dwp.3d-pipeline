# Check for Administrative Privileges
if (!([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Start-Process powershell.exe "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Verb RunAs
    exit
}

Write-Host "Setting up DWP Pipeline Protocols..." -ForegroundColor Cyan

# Function to register a protocol
function Register-Protocol {
    param (
        [string]$ProtocolName,
        [string]$AppPath
    )

    if (-not (Test-Path $AppPath)) {
        Write-Host "Executable not found: $AppPath" -ForegroundColor Red
        return
    }

    $RegistryPath = "HKCR:\$ProtocolName"
    
    # Create Protocol Key
    if (-not (Test-Path $RegistryPath)) {
        New-Item -Path $RegistryPath -Force | Out-Null
    }
    Set-ItemProperty -Path $RegistryPath -Name "(default)" -Value "URL:$ProtocolName Protocol"
    Set-ItemProperty -Path $RegistryPath -Name "URL Protocol" -Value ""

    # Create Shell/Open/Command Key
    $CommandPath = "$RegistryPath\shell\open\command"
    if (-not (Test-Path $CommandPath)) {
        New-Item -Path $CommandPath -Force | Out-Null
    }
    
    # Set the command to open the app
    # \"%1\" passes the argument, but for now we just want to open the app. 
    # We ignore the protocol argument and just run the exe.
    Set-ItemProperty -Path $CommandPath -Name "(default)" -Value "`"$AppPath`""

    Write-Host "Registered $ProtocolName -> $AppPath" -ForegroundColor Green
}

# --- Find 3ds Max ---
Write-Host "Searching for 3ds Max..."
$MaxPaths = @(
    "C:\Program Files\Autodesk\3ds Max 2024\3dsmax.exe",
    "C:\Program Files\Autodesk\3ds Max 2023\3dsmax.exe",
    "C:\Program Files\Autodesk\3ds Max 2022\3dsmax.exe",
    "C:\Program Files\Autodesk\3ds Max 2021\3dsmax.exe"
)

$MaxExe = $null
foreach ($path in $MaxPaths) {
    if (Test-Path $path) {
        $MaxExe = $path
        break
    }
}

if ($MaxExe) {
    Register-Protocol -ProtocolName "dwp-max" -AppPath $MaxExe
}
else {
    Write-Host "3ds Max not found in standard locations." -ForegroundColor Yellow
    # Optional: Ask user to browse (simplified for now)
}

# --- Find Revit ---
Write-Host "Searching for Revit..."
$RevitPaths = @(
    "C:\Program Files\Autodesk\Revit 2024\Revit.exe",
    "C:\Program Files\Autodesk\Revit 2023\Revit.exe",
    "C:\Program Files\Autodesk\Revit 2022\Revit.exe",
    "C:\Program Files\Autodesk\Revit 2021\Revit.exe"
)

$RevitExe = $null
foreach ($path in $RevitPaths) {
    if (Test-Path $path) {
        $RevitExe = $path
        break
    }
}

if ($RevitExe) {
    Register-Protocol -ProtocolName "dwp-revit" -AppPath $RevitExe
}
else {
    Write-Host "Revit not found in standard locations." -ForegroundColor Yellow
}

Write-Host "Done! You can now launch apps from the web pipeline." -ForegroundColor Cyan
Read-Host "Press Enter to exit..."
