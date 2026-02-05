@echo off
title Uma Viewer Launcher
cd /d "%~dp0"

echo.
echo  =============================================
echo   Uma Viewer Launcher
echo  =============================================
echo.

:: Check for Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python is not installed or not in PATH
    echo.
    echo Please install Python from the Microsoft Store:
    echo   Search "Python 3.13" in the Microsoft Store app
    echo   Or visit: https://apps.microsoft.com/detail/9pnrbtzxmb4z
    echo.
    pause
    exit /b 1
)

echo Starting launcher...
echo.
python launcher.py

:: If Python exits with error, pause so user can see it
if errorlevel 1 (
    echo.
    echo [ERROR] Launcher exited with an error
    pause
)
