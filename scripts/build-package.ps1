[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $projectRoot "manifest.json"
$outputDirectory = Join-Path $projectRoot "dist"
$temporaryRoot = [System.IO.Path]::GetFullPath(
  [System.IO.Path]::Combine(
    [System.IO.Path]::GetTempPath(),
    "tab-link-exporter-package-$([System.Guid]::NewGuid().ToString('N'))"
  )
)

$packageFiles = @(
  "manifest.json"
  "popup.html"
  "popup.css"
  "popup.js"
  "icons/icon16.png"
  "icons/icon32.png"
  "icons/icon48.png"
  "icons/icon128.png"
)

function Test-PackageContents {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ArchivePath,

    [Parameter(Mandatory = $true)]
    [string[]]$ExpectedFiles
  )

  Add-Type -AssemblyName System.IO.Compression.FileSystem

  $archive = [System.IO.Compression.ZipFile]::OpenRead($ArchivePath)

  try {
    $actualFiles = @(
      $archive.Entries |
        Where-Object { -not [string]::IsNullOrEmpty($_.Name) } |
        ForEach-Object { $_.FullName.Replace("\", "/") } |
        Sort-Object
    )
    $expectedArchiveFiles = @(
      $ExpectedFiles |
        ForEach-Object { $_.Replace("\", "/") } |
        Sort-Object
    )
    $differences = Compare-Object $expectedArchiveFiles $actualFiles

    if ($null -ne $differences) {
      $details = ($differences | Out-String).Trim()
      throw "ZIP contents do not match the package file list.`n$details"
    }

    if ($actualFiles -notcontains "manifest.json") {
      throw "manifest.json is not located at the root of the ZIP archive."
    }
  }
  finally {
    $archive.Dispose()
  }
}

try {
  if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
    throw "manifest.json was not found: $manifestPath"
  }

  $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 |
    ConvertFrom-Json
  $version = [string]$manifest.version

  if ($version -notmatch "^\d+(\.\d+){0,3}$") {
    throw "The manifest version is invalid: $version"
  }

  foreach ($relativePath in $packageFiles) {
    $sourcePath = Join-Path $projectRoot $relativePath

    if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
      throw "A package file was not found: $relativePath"
    }
  }

  New-Item -ItemType Directory -Path $temporaryRoot | Out-Null

  foreach ($relativePath in $packageFiles) {
    $sourcePath = Join-Path $projectRoot $relativePath
    $destinationPath = Join-Path $temporaryRoot $relativePath
    $destinationParent = Split-Path -Parent $destinationPath

    if (-not (Test-Path -LiteralPath $destinationParent -PathType Container)) {
      New-Item -ItemType Directory -Path $destinationParent -Force | Out-Null
    }

    Copy-Item -LiteralPath $sourcePath -Destination $destinationPath
  }

  New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null

  $archiveName = "tab-link-exporter-$version.zip"
  $archivePath = Join-Path $outputDirectory $archiveName

  if (Test-Path -LiteralPath $archivePath -PathType Leaf) {
    [System.IO.File]::Delete($archivePath)
  }

  Compress-Archive `
    -Path (Join-Path $temporaryRoot "*") `
    -DestinationPath $archivePath `
    -CompressionLevel Optimal

  Test-PackageContents -ArchivePath $archivePath -ExpectedFiles $packageFiles

  Write-Host "Package created: $archivePath"
}
finally {
  $systemTemporaryDirectory = [System.IO.Path]::GetFullPath(
    [System.IO.Path]::GetTempPath()
  )

  if (
    $temporaryRoot.StartsWith(
      $systemTemporaryDirectory,
      [System.StringComparison]::OrdinalIgnoreCase
    ) -and
    (Test-Path -LiteralPath $temporaryRoot -PathType Container)
  ) {
    Remove-Item -LiteralPath $temporaryRoot -Recurse -Force
  }
}
