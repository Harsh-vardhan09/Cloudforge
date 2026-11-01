@echo off
title ComputeGrid GPU Agent Installer
echo Starting the ComputeGrid GPU Agent installer...
echo Keep this window open to see setup progress and errors.
echo.

where py >nul 2>nul
if not errorlevel 1 (
    py -3.12 --version >nul 2>nul
    if not errorlevel 1 (
        py -3.12 "%~dp0Install-ComputeGridAgent.py"
        goto finished
    )
    py -3.11 --version >nul 2>nul
    if not errorlevel 1 (
        py -3.11 "%~dp0Install-ComputeGridAgent.py"
        goto finished
    )
    py -3.13 --version >nul 2>nul
    if not errorlevel 1 (
        py -3.13 "%~dp0Install-ComputeGridAgent.py"
        goto finished
    )
)

where python >nul 2>nul
if not errorlevel 1 (
    python "%~dp0Install-ComputeGridAgent.py"
    goto finished
)

echo Python 3.11, 3.12, or 3.13 was not found.
echo Install Python from https://www.python.org/downloads/ and enable "Add Python to PATH".

:finished
echo.
echo Installer finished. If an error appeared above, resolve it and run Install.bat again.
pause
