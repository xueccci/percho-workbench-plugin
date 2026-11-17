[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidateSet('install', 'uninstall', 'status')][string]$Action,
    [string]$Target,
    [switch]$PauseAtEnd
)
$ErrorActionPreference = 'Stop'
$installer = Join-Path (Split-Path $PSScriptRoot -Parent) 'dist\installer.cjs'
$previousNodeMode = $env:ELECTRON_RUN_AS_NODE
$previousEncoding = [Console]::OutputEncoding
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$result = 1

function Valid-Target([string]$Path) {
    return (Test-Path -LiteralPath (Join-Path $Path 'Percho.exe') -PathType Leaf) -and
        (Test-Path -LiteralPath (Join-Path $Path 'resources\app.asar') -PathType Leaf)
}

function Find-Targets {
    $paths = [System.Collections.Generic.List[string]]::new()
    Get-Process Percho -ErrorAction SilentlyContinue | ForEach-Object {
        if ($_.Path) { $paths.Add([IO.Path]::GetDirectoryName($_.Path)) }
    }
    $registryRoots = @(
        'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
    )
    foreach ($registryRoot in $registryRoots) {
        Get-ItemProperty $registryRoot -ErrorAction SilentlyContinue | Where-Object {
            $_.DisplayName -like '*Percho*'
        } | ForEach-Object {
            if ($_.InstallLocation) { $paths.Add($_.InstallLocation) }
            elseif ($_.DisplayIcon) {
                $icon = ($_.DisplayIcon -replace ',\d+$', '').Trim('"')
                $paths.Add([IO.Path]::GetDirectoryName($icon))
            }
        }
    }
    foreach ($directory in @($env:LOCALAPPDATA, $env:ProgramFiles, ${env:ProgramFiles(x86)})) {
        if ($directory) {
            $paths.Add((Join-Path $directory 'Percho'))
            $paths.Add((Join-Path $directory 'Programs\Percho'))
        }
    }
    $paths | Select-Object -Unique | Where-Object { Valid-Target $_ }
}

try {
    Write-Host "Percho Workbench 插件：$Action"
    if (-not (Test-Path -LiteralPath $installer)) { throw '安装包不完整，请完整解压 ZIP 后重试。' }
    if (-not $Target) {
        $candidates = @(Find-Targets)
        for ($i = 0; $i -lt $candidates.Count; $i++) { Write-Host "[$($i + 1)] $($candidates[$i])" }
        if ([Console]::IsInputRedirected) { throw '请通过 -Target 参数指定 Percho 安装目录。' }
        $choice = Read-Host '输入编号，或按 Enter 浏览安装文件夹（Q 取消）'
        if ($choice -eq 'Q') { throw '已取消。' }
        $number = 0
        if ([int]::TryParse($choice, [ref]$number) -and $number -gt 0 -and $number -le $candidates.Count) {
            $Target = $candidates[$number - 1]
        } elseif (-not $choice -or $choice -eq 'B') {
            Add-Type -AssemblyName System.Windows.Forms
            $dialog = [System.Windows.Forms.FolderBrowserDialog]::new()
            try {
                $dialog.Description = '选择包含 Percho.exe 的原版 Percho 安装目录'
                $dialog.ShowNewFolderButton = $false
                if ($dialog.ShowDialog() -ne 'OK') { throw '已取消。' }
                $Target = $dialog.SelectedPath
            } finally { $dialog.Dispose() }
        } else { throw '无效的目录编号，请重新运行。' }
    }
    $Target = (Resolve-Path -LiteralPath $Target).ProviderPath
    if (-not (Valid-Target $Target)) { throw '请选择包含 Percho.exe 和 resources\app.asar 的安装目录。' }
    Write-Host "目标：$Target"
    if ($Action -ne 'status') { Write-Host '目标 Percho 必须完全退出；安装器不会结束任何进程。' }
    $env:ELECTRON_RUN_AS_NODE = '1'
    $start = [Diagnostics.ProcessStartInfo]::new()
    $start.FileName = Join-Path $Target 'Percho.exe'
    $start.Arguments = '"{0}" {1} --target "{2}"' -f $installer, $Action, $Target
    $start.UseShellExecute = $false
    $child = [Diagnostics.Process]::Start($start)
    try { $child.WaitForExit(); $result = $child.ExitCode } finally { $child.Dispose() }
    if ($result -ne 0) { Write-Host "操作未完成，退出码：$result" -ForegroundColor Red }
    else { Write-Host '完成。' -ForegroundColor Green }
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    $result = 1
} finally {
    $env:ELECTRON_RUN_AS_NODE = $previousNodeMode
    [Console]::OutputEncoding = $previousEncoding
    if ($PauseAtEnd -and -not [Console]::IsInputRedirected) { [void](Read-Host '按 Enter 关闭窗口') }
}
exit $result
