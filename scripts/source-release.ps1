param([string]$Version = '0.1.0')
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$name = "percho-workbench-plugin-$Version-source"
$staging = Join-Path (Join-Path $root '.local') $name
New-Item -ItemType Directory -Path $staging -Force | Out-Null
foreach ($path in @('src','scripts','tests','host-source','npm-package','docs','.github','package.json','package-lock.json','.gitignore','.gitattributes','README.md','NOTICE.md','LICENSE','THIRD_PARTY_NOTICES.md','DELIVERY.md','install.cmd','uninstall.cmd','status.cmd')) {
    Copy-Item -LiteralPath (Join-Path $root $path) -Destination $staging -Recurse -Force
}
$zip = Join-Path (Join-Path $root 'release') "$name.zip"
Remove-Item -LiteralPath (Join-Path $staging 'npm-package\vendor') -Recurse -Force -ErrorAction SilentlyContinue
Compress-Archive -LiteralPath $staging -DestinationPath $zip -Force
$hash = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText("$zip.sha256", "$hash  $name.zip`n", [Text.UTF8Encoding]::new($false))
Write-Output $zip
Write-Output $hash
