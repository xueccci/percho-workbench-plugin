param([string]$Version = '0.1.0')
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$name = "percho-workbench-plugin-$Version-win-x64"
$release = Join-Path $root 'release'
$folder = Join-Path $release $name
$zip = Join-Path $release "$name.zip"
if (-not (Test-Path -LiteralPath (Join-Path $folder 'dist\manifest.json'))) { throw 'Build the plugin first.' }
Compress-Archive -LiteralPath $folder -DestinationPath $zip -Force
$hash = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText("$zip.sha256", "$hash  $name.zip`n", [Text.UTF8Encoding]::new($false))
Write-Output $zip
Write-Output $hash
