@echo off
setlocal
cd /d "%~dp0"
start "" "%~dp0index.html"
echo Opened Draw Down Code Issuer in your browser.
echo You can close this window.
timeout /t 3 >nul
