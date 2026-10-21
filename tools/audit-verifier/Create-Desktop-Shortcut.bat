@echo off
setlocal
set "TARGET=%~dp0Open-Audit-Verifier.bat"
set "ICON=%~dp0app-icon.png"
set "DESKTOP=%USERPROFILE%\Desktop"
if defined OneDrive if exist "%OneDrive%\Desktop\" set "DESKTOP=%OneDrive%\Desktop"
set "LINK=%DESKTOP%\Draw Down Audit Verifier.lnk"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%LINK%'); $s.TargetPath = '%TARGET%'; $s.WorkingDirectory = '%~dp0'; $s.IconLocation = '%ICON%'; $s.WindowStyle = 7; $s.Description = 'Draw Down offline audit JSON+CSV verifier'; $s.Save(); Write-Host 'Shortcut created on Desktop.'"

echo.
echo Shortcut: %LINK%
pause
