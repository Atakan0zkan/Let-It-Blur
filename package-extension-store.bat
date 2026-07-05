@echo off
setlocal EnableExtensions

set "ROOT=%~dp0"
set "ROOT=%ROOT:~0,-1%"

where powershell.exe >nul 2>nul
if errorlevel 1 (
  echo [ERROR] powershell.exe was not found.
  endlocal
  exit /b 1
)

if not exist "%ROOT%\tools\package-extension-store.ps1" (
  echo [ERROR] tools\package-extension-store.ps1 was not found.
  endlocal
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\tools\package-extension-store.ps1" -Root "%ROOT%"
if errorlevel 1 (
  endlocal
  exit /b 1
)

endlocal
exit /b 0
