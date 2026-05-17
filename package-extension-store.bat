@echo off
setlocal EnableExtensions

set "ROOT=%~dp0"
set "DIST=%ROOT%dist"
set "STAGE=%DIST%\store-package"

pushd "%ROOT%" >nul

where powershell.exe >nul 2>nul
if errorlevel 1 (
  echo [ERROR] powershell.exe was not found.
  goto :fail
)

if not exist "manifest.json" (
  echo [ERROR] manifest.json was not found next to this script.
  goto :fail
)

echo [1/5] Validating manifest and locale JSON...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "try { Get-Content -Raw -LiteralPath 'manifest.json' | ConvertFrom-Json | Out-Null; Get-ChildItem -LiteralPath '_locales' -Recurse -Filter 'messages.json' | ForEach-Object { Get-Content -Raw -LiteralPath $_.FullName | ConvertFrom-Json | Out-Null }; exit 0 } catch { Write-Host $_.Exception.Message -ForegroundColor Red; exit 1 }"
if errorlevel 1 goto :fail

for /f "delims=" %%V in ('powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "(Get-Content -Raw -LiteralPath 'manifest.json' | ConvertFrom-Json).version"') do set "VERSION=%%V"
if "%VERSION%"=="" (
  echo [ERROR] Could not read extension version from manifest.json.
  goto :fail
)

set "ZIP_PATH=%DIST%\Let-It-Blur-Screen-Privacy-v%VERSION%-store.zip"

echo [2/5] Preparing clean staging folder...
if exist "%STAGE%" rmdir /s /q "%STAGE%"
if errorlevel 1 goto :fail
if not exist "%DIST%" mkdir "%DIST%"
if errorlevel 1 goto :fail
mkdir "%STAGE%"
if errorlevel 1 goto :fail

echo [3/5] Copying Chrome Web Store package files...
for %%F in (
  manifest.json
  service-worker.js
  content-script.js
  popup.html
  popup.css
  popup.js
) do (
  if not exist "%%F" (
    echo [ERROR] Required file missing: %%F
    goto :fail
  )
  copy /y "%%F" "%STAGE%\" >nul
  if errorlevel 1 goto :fail
)

for %%D in (
  icons
  _locales
) do (
  if not exist "%%D\" (
    echo [ERROR] Required folder missing: %%D
    goto :fail
  )
  xcopy "%%D" "%STAGE%\%%D\" /e /i /y /q >nul
  if errorlevel 1 goto :fail
)

for %%F in (
  LICENSE
  PRIVACY.md
) do (
  if exist "%%F" copy /y "%%F" "%STAGE%\" >nul
)

echo [4/5] Creating ZIP...
if exist "%ZIP_PATH%" del /f /q "%ZIP_PATH%"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Compress-Archive -Path '%STAGE%\*' -DestinationPath '%ZIP_PATH%' -Force"
if errorlevel 1 goto :fail

echo [5/5] Verifying ZIP contents...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "try { Add-Type -AssemblyName System.IO.Compression.FileSystem; $zip = [IO.Compression.ZipFile]::OpenRead('%ZIP_PATH%'); $names = $zip.Entries.FullName; $required = @('manifest.json','service-worker.js','content-script.js','popup.html','popup.css','popup.js','icons/icon128.png','icons/logo.svg','_locales/en/messages.json'); foreach ($item in $required) { if ($names -notcontains $item) { throw ('Missing from ZIP: ' + $item) } }; $blocked = @('AGENTS.md','agents.md','Agents.md','memory-bank/activeContext.md','generate-assets.js','capture-popup.js','store-assets.html'); foreach ($item in $blocked) { if ($names -contains $item) { throw ('Local-only file was packaged: ' + $item) } }; exit 0 } catch { Write-Host $_.Exception.Message -ForegroundColor Red; exit 1 } finally { if ($zip) { $zip.Dispose() } }"
if errorlevel 1 goto :fail

rmdir /s /q "%STAGE%"

echo.
echo Chrome Web Store ZIP created:
echo "%ZIP_PATH%"
echo.
echo Upload this ZIP in the Chrome Web Store Developer Dashboard.

popd >nul
endlocal
exit /b 0

:fail
echo.
echo Packaging failed.
if exist "%STAGE%" rmdir /s /q "%STAGE%" >nul 2>nul
popd >nul
endlocal
exit /b 1
