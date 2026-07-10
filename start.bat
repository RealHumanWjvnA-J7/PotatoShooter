@echo off
REM Launches a local HTTP server (needed because browsers block module/GLTF
REM loading over file://) and opens the demo in the default browser.
REM Just double-click this file to run.

cd /d "%~dp0"

set PORT=8642

where python >nul 2>nul
if %ERRORLEVEL%==0 (
    set SERVE_CMD=python -m http.server %PORT%
    goto :serve
)

where py >nul 2>nul
if %ERRORLEVEL%==0 (
    set SERVE_CMD=py -m http.server %PORT%
    goto :serve
)

where npx >nul 2>nul
if %ERRORLEVEL%==0 (
    set SERVE_CMD=npx --yes http-server -p %PORT%
    goto :serve
)

echo No python or npx found. Install Python from https://www.python.org/downloads/
echo (check "Add python.exe to PATH" during install) and run this again.
pause
exit /b 1

:serve
echo Starting local server on http://localhost:%PORT% ...
start "GLTF FPS Demo Server" cmd /k %SERVE_CMD%

timeout /t 1 /nobreak >nul

start "" "http://localhost:%PORT%/index.html"

echo.
echo Game should now be open in your browser.
echo Close the other black "GLTF FPS Demo Server" window to stop the server.
pause
