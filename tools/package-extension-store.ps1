param(
  [string]$Root = (Split-Path -Parent $PSScriptRoot)
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$rootPath = [System.IO.Path]::GetFullPath($Root)
$distPath = Join-Path $rootPath "dist"
$stagePath = Join-Path $distPath "store-package"
$pushedLocation = $false

function Read-JsonFile {
  param([string]$Path)

  Get-Content -Raw -LiteralPath $Path | ConvertFrom-Json
}

function Assert-PathExists {
  param(
    [string]$Path,
    [string]$Description
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    throw "$Description missing: $Path"
  }
}

function Copy-RequiredFile {
  param([string]$Name)

  $source = Join-Path $rootPath $Name
  Assert-PathExists -Path $source -Description "Required file"
  Copy-Item -LiteralPath $source -Destination $stagePath -Force
}

function Copy-RequiredDirectory {
  param([string]$Name)

  $source = Join-Path $rootPath $Name
  $destination = Join-Path $stagePath $Name
  Assert-PathExists -Path $source -Description "Required folder"
  New-Item -ItemType Directory -Force -Path $destination | Out-Null
  Copy-Item -Path (Join-Path $source "*") -Destination $destination -Recurse -Force
}

function Test-ZipContents {
  param([string]$ZipPath)

  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip = [IO.Compression.ZipFile]::OpenRead($ZipPath)

  try {
    $names = @($zip.Entries.FullName | ForEach-Object { $_ -replace "\\", "/" })
    $required = @(
      "manifest.json",
      "service-worker.js",
      "content-script.js",
      "popup.html",
      "popup.css",
      "popup.js",
      "icons/icon128.png",
      "icons/logo.svg",
      "_locales/en/messages.json"
    )
    $blocked = @(
      "AGENTS.md",
      "agents.md",
      "Agents.md",
      "memory-bank/activeContext.md",
      "generate-assets.js",
      "capture-popup.js",
      "store-assets.html"
    )

    foreach ($item in $required) {
      if ($names -notcontains $item) {
        throw "Missing from ZIP: $item"
      }
    }

    foreach ($item in $blocked) {
      if ($names -contains $item) {
        throw "Local-only file was packaged: $item"
      }
    }
  } finally {
    $zip.Dispose()
  }
}

try {
  Push-Location -LiteralPath $rootPath
  $pushedLocation = $true

  $manifestPath = Join-Path $rootPath "manifest.json"
  Assert-PathExists -Path $manifestPath -Description "manifest.json"

  Write-Host "[1/5] Validating manifest and locale JSON..."
  $manifest = Read-JsonFile -Path $manifestPath
  Get-ChildItem -LiteralPath (Join-Path $rootPath "_locales") -Recurse -Filter "messages.json" |
    ForEach-Object { Read-JsonFile -Path $_.FullName | Out-Null }

  $version = [string]$manifest.version
  if ([string]::IsNullOrWhiteSpace($version)) {
    throw "Could not read extension version from manifest.json."
  }

  $zipPath = Join-Path $distPath "Let-It-Blur-Screen-Privacy-v$version-store.zip"

  Write-Host "[2/5] Preparing clean staging folder..."
  if (Test-Path -LiteralPath $stagePath) {
    Remove-Item -LiteralPath $stagePath -Recurse -Force
  }
  New-Item -ItemType Directory -Force -Path $distPath | Out-Null
  New-Item -ItemType Directory -Force -Path $stagePath | Out-Null

  Write-Host "[3/5] Copying Chrome Web Store package files..."
  @(
    "manifest.json",
    "service-worker.js",
    "content-script.js",
    "popup.html",
    "popup.css",
    "popup.js"
  ) | ForEach-Object { Copy-RequiredFile -Name $_ }

  @("icons", "_locales") | ForEach-Object { Copy-RequiredDirectory -Name $_ }

  @("LICENSE", "PRIVACY.md") | ForEach-Object {
    $source = Join-Path $rootPath $_
    if (Test-Path -LiteralPath $source) {
      Copy-Item -LiteralPath $source -Destination $stagePath -Force
    }
  }

  Write-Host "[4/5] Creating ZIP..."
  if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
  }
  Compress-Archive -Path (Join-Path $stagePath "*") -DestinationPath $zipPath -Force

  Write-Host "[5/5] Verifying ZIP contents..."
  Test-ZipContents -ZipPath $zipPath
  Remove-Item -LiteralPath $stagePath -Recurse -Force

  Write-Host ""
  Write-Host "Chrome Web Store ZIP created:"
  Write-Host "`"$zipPath`""
  Write-Host ""
  Write-Host "Upload this ZIP in the Chrome Web Store Developer Dashboard."
  exit 0
} catch {
  Write-Host $_.Exception.Message -ForegroundColor Red
  Write-Host ""
  Write-Host "Packaging failed."

  if (Test-Path -LiteralPath $stagePath) {
    Remove-Item -LiteralPath $stagePath -Recurse -Force
  }

  exit 1
} finally {
  if ($pushedLocation) {
    Pop-Location
  }
}
