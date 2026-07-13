param(
  [string]$Root = (Split-Path -Parent $PSScriptRoot)
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$rootPath = [System.IO.Path]::GetFullPath($Root)
$packagerPath = Join-Path $rootPath "tools\package-extension-store.ps1"
$localeFixturePath = Join-Path $rootPath "_locales\en\unexpected-validation-fixture.txt"
$iconFixturePath = Join-Path $rootPath "icons\unexpected-validation-fixture.txt"
$enginePath = (Get-Process -Id $PID).Path

foreach ($fixturePath in @($localeFixturePath, $iconFixturePath)) {
  if (Test-Path -LiteralPath $fixturePath) {
    throw "Refusing to overwrite existing fixture path: $fixturePath"
  }
}

function Invoke-Packager {
  $output = & $enginePath -NoProfile -ExecutionPolicy Bypass -File $packagerPath -Root $rootPath 2>&1 | Out-String
  [pscustomobject]@{
    ExitCode = $LASTEXITCODE
    Output = $output
  }
}

function Assert-PackagerRejectsFixture {
  param(
    [string]$FixturePath,
    [string]$ExpectedMessage
  )

  try {
    [System.IO.File]::WriteAllText(
      $FixturePath,
      "harmless packaging allowlist regression fixture`n",
      [System.Text.UTF8Encoding]::new($false)
    )

    $blocked = Invoke-Packager
    if ($blocked.ExitCode -eq 0) {
      throw "Packager accepted unexpected content: $FixturePath"
    }
    if ($blocked.Output -notmatch [regex]::Escape($ExpectedMessage)) {
      throw "Packager failed for an unexpected reason:`n$($blocked.Output)"
    }
  } finally {
    if (Test-Path -LiteralPath $FixturePath) {
      Remove-Item -LiteralPath $FixturePath -Force
    }
  }
}

try {
  Assert-PackagerRejectsFixture -FixturePath $localeFixturePath -ExpectedMessage "Locale folder must contain only messages.json"
  Assert-PackagerRejectsFixture -FixturePath $iconFixturePath -ExpectedMessage "Unexpected icons entry"

  $allowed = Invoke-Packager
  if ($allowed.ExitCode -ne 0) {
    throw "Packager rejected the legitimate allowlisted package:`n$($allowed.Output)"
  }

  Write-Host "PASS: unexpected locale descendants are rejected."
  Write-Host "PASS: unexpected icon descendants are rejected."
  Write-Host "PASS: the legitimate allowlisted extension package is accepted."
  exit 0
} finally {
  foreach ($fixturePath in @($localeFixturePath, $iconFixturePath)) {
    if (Test-Path -LiteralPath $fixturePath) {
      Remove-Item -LiteralPath $fixturePath -Force
    }
  }
}
