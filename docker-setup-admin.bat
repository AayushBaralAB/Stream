@echo off
setlocal

echo ============================================================
echo  AB Streaming Software - Docker/WSL2 setup script
echo  Run this as Administrator. It will enable required Windows
echo  features and then reboot the machine automatically.
echo ============================================================
echo.

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Please run this script as Administrator.
    echo Right-click the file and choose "Run as administrator".
    pause
    exit /b 1
)

echo [1/3] Enabling Windows Subsystem for Linux (WSL) feature...
dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart

echo [2/3] Enabling Virtual Machine Platform feature (required for WSL2 / Docker)...
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart

echo [3/3] Setting WSL 2 as the default version...
wsl --set-default-version 2 >nul 2>&1

echo.
echo All features enabled. The machine needs to reboot to finish.
echo.
set /p REBOOTNOW="Reboot now? (Y/N): "
if /i "%REBOOTNOW%"=="Y" (
    shutdown /r /t 5 /c "AB Streaming Software setup - rebooting to finish Docker/WSL2 setup"
) else (
    echo Please reboot manually before using Docker.
)

pause
