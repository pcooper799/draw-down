@echo off
setlocal
set "TARGET=%~dp0Open-Code-Issuer.bat"
set "ICON=%~dp0favicon.png"
set "DESKTOP=%USERPROFILE%\Desktop"
set "LINK=%DESKTOP%\Draw Down Code Issuer.lnk"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%LINK%'); $s.TargetPath = '%TARGET%'; $s.WorkingDirectory = '%~dp0'; $s.WindowStyle = 7; $s.Description = 'Draw Down offline activation code issuer'; $s.Save(); Write-Host 'Shortcut created on Desktop.'"

echo.
echo Shortcut: %LINK%
pause
