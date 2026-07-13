param(
  [string]$Root = (Split-Path -Parent $PSScriptRoot)
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$rootPath = [System.IO.Path]::GetFullPath($Root)
$distPath = Join-Path $rootPath "dist"
$stagePath = Join-Path $distPath "store-package"
$pushedLocation = $false

$requiredPackageFiles = @(
  "manifest.json",
  "service-worker.js",
  "content-script.js",
  "popup.html",
  "popup.css",
  "popup.js"
)
$optionalPackageFiles = @("LICENSE", "PRIVACY.md")
$requiredIconFiles = @("icon16.png", "icon32.png", "icon48.png", "icon128.png", "logo.svg")
$supportedLocales = @(
  "am", "ar", "bg", "bn", "ca", "cs", "da", "de", "el", "en", "en_AU",
  "en_GB", "en_US", "es", "es_419", "et", "fa", "fi", "fil", "fr", "gu",
  "he", "hi", "hr", "hu", "id", "it", "ja", "kn", "ko", "lt", "lv", "ml",
  "mr", "ms", "nl", "no", "pl", "pt_BR", "pt_PT", "ro", "ru", "sk", "sl",
  "sr", "sv", "sw", "ta", "te", "th", "tr", "uk", "vi", "zh_CN", "zh_TW"
)

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

function Assert-SafeFile {
  param(
    [string]$Path,
    [string]$Description
  )

  Assert-PathExists -Path $Path -Description $Description
  $item = Get-Item -LiteralPath $Path -Force
  if ($item.PSIsContainer) {
    throw "$Description must be a file: $Path"
  }
  if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw "$Description must not be a reparse point: $Path"
  }

  return $item
}

function Assert-SafeDirectory {
  param(
    [string]$Path,
    [string]$Description
  )

  Assert-PathExists -Path $Path -Description $Description
  $item = Get-Item -LiteralPath $Path -Force
  if (-not $item.PSIsContainer) {
    throw "$Description must be a folder: $Path"
  }
  if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw "$Description must not be a reparse point: $Path"
  }

  return $item
}

function Copy-RequiredFile {
  param([string]$Name)

  $source = Join-Path $rootPath $Name
  Assert-SafeFile -Path $source -Description "Required file" | Out-Null
  Copy-Item -LiteralPath $source -Destination $stagePath -Force
}

function Get-ValidatedIconFiles {
  $source = Join-Path $rootPath "icons"
  Assert-SafeDirectory -Path $source -Description "Required icons folder" | Out-Null

  foreach ($entry in @(Get-ChildItem -LiteralPath $source -Force)) {
    if ($entry.PSIsContainer -or $requiredIconFiles -notcontains $entry.Name) {
      throw "Unexpected icons entry: $($entry.FullName)"
    }
  }

  foreach ($name in $requiredIconFiles) {
    $path = Join-Path $source $name
    (Assert-SafeFile -Path $path -Description "Required icon file").FullName
  }
}

function Get-ValidatedLocaleMessageFiles {
  $source = Join-Path $rootPath "_locales"
  Assert-SafeDirectory -Path $source -Description "Required locales folder" | Out-Null

  foreach ($entry in @(Get-ChildItem -LiteralPath $source -Force)) {
    if (-not $entry.PSIsContainer -or $supportedLocales -notcontains $entry.Name) {
      throw "Unexpected locales entry: $($entry.FullName)"
    }
  }

  foreach ($locale in $supportedLocales) {
    $localePath = Join-Path $source $locale
    Assert-SafeDirectory -Path $localePath -Description "Required locale folder" | Out-Null
    $entries = @(Get-ChildItem -LiteralPath $localePath -Force)
    if ($entries.Count -ne 1 -or $entries[0].PSIsContainer -or $entries[0].Name -cne "messages.json") {
      throw "Locale folder must contain only messages.json: $localePath"
    }

    (Assert-SafeFile -Path $entries[0].FullName -Description "Locale messages file").FullName
  }
}

function Copy-ValidatedDirectoryFiles {
  param(
    [string[]]$Files,
    [string]$DirectoryName
  )

  $destinationRoot = Join-Path $stagePath $DirectoryName
  New-Item -ItemType Directory -Force -Path $destinationRoot | Out-Null

  foreach ($file in $Files) {
    if ($DirectoryName -eq "icons") {
      Copy-Item -LiteralPath $file -Destination $destinationRoot -Force
      continue
    }

    $locale = Split-Path -Leaf (Split-Path -Parent $file)
    $localeDestination = Join-Path $destinationRoot $locale
    New-Item -ItemType Directory -Force -Path $localeDestination | Out-Null
    Copy-Item -LiteralPath $file -Destination $localeDestination -Force
  }
}

function Test-ZipContents {
  param(
    [string]$ZipPath,
    [string[]]$ExpectedEntries
  )

  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip = [IO.Compression.ZipFile]::OpenRead($ZipPath)

  try {
    $names = @(
      $zip.Entries |
        Where-Object { -not [string]::IsNullOrEmpty($_.Name) } |
        ForEach-Object { $_.FullName -replace "\\", "/" }
    )
    $duplicates = @($names | Group-Object | Where-Object Count -gt 1)
    if ($duplicates.Count -gt 0) {
      throw "Duplicate ZIP entry: $($duplicates[0].Name)"
    }

    foreach ($item in $ExpectedEntries) {
      if ($names -cnotcontains $item) {
        throw "Missing from ZIP: $item"
      }
    }

    foreach ($item in $names) {
      if ($ExpectedEntries -cnotcontains $item) {
        throw "Unexpected file in ZIP: $item"
      }
    }

    if ($names.Count -ne $ExpectedEntries.Count) {
      throw "ZIP file count mismatch. Expected $($ExpectedEntries.Count), found $($names.Count)."
    }
  } finally {
    $zip.Dispose()
  }
}

try {
  Push-Location -LiteralPath $rootPath
  $pushedLocation = $true

  $manifestPath = Join-Path $rootPath "manifest.json"
  Assert-SafeFile -Path $manifestPath -Description "manifest.json" | Out-Null

  Write-Host "[1/5] Validating manifest and allowlisted package files..."
  $manifest = Read-JsonFile -Path $manifestPath
  $iconFiles = @(Get-ValidatedIconFiles)
  $localeMessageFiles = @(Get-ValidatedLocaleMessageFiles)
  $localeMessageFiles | ForEach-Object { Read-JsonFile -Path $_ | Out-Null }

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
  $requiredPackageFiles | ForEach-Object { Copy-RequiredFile -Name $_ }
  Copy-ValidatedDirectoryFiles -Files $iconFiles -DirectoryName "icons"
  Copy-ValidatedDirectoryFiles -Files $localeMessageFiles -DirectoryName "_locales"

  $expectedZipEntries = @($requiredPackageFiles)
  $expectedZipEntries += @($requiredIconFiles | ForEach-Object { "icons/$_" })
  $expectedZipEntries += @($supportedLocales | ForEach-Object { "_locales/$_/messages.json" })

  foreach ($name in $optionalPackageFiles) {
    $source = Join-Path $rootPath $name
    if (Test-Path -LiteralPath $source) {
      Assert-SafeFile -Path $source -Description "Optional package file" | Out-Null
      Copy-Item -LiteralPath $source -Destination $stagePath -Force
      $expectedZipEntries += $name
    }
  }

  Write-Host "[4/5] Creating ZIP..."
  if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
  }
  Compress-Archive -Path (Join-Path $stagePath "*") -DestinationPath $zipPath -Force

  Write-Host "[5/5] Verifying exact ZIP allowlist..."
  Test-ZipContents -ZipPath $zipPath -ExpectedEntries $expectedZipEntries
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
