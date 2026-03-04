#!/usr/bin/env pwsh
# Claude Code 离线安装包下载脚本 (简化版)
# 直接从 npm registry 下载所有 .tgz 文件

$ErrorActionPreference = "Stop"

# 配置
$OUTPUT_DIR = "claude-code-offline"
$NPM_REGISTRY = "https://registry.npmjs.org"
$PACKAGE_NAME = "@anthropic-ai/claude-code"

Write-Host "====================================" -ForegroundColor Cyan
Write-Host "Claude Code 离线包下载工具" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""

# 创建输出目录
$BASE_DIR = Join-Path $PSScriptRoot $OUTPUT_DIR
$NPM_DIR = Join-Path $BASE_DIR "npm-packages"
New-Item -ItemType Directory -Force -Path $NPM_DIR | Out-Null

# 获取包信息
Write-Host "[1/3] 获取包信息..." -ForegroundColor Yellow
try {
    $INFO_URL = "$NPM_REGISTRY/$($PACKAGE_NAME.Replace('@', ''))"
    $PACKAGE_INFO = Invoke-RestMethod -Uri $INFO_URL -UseBasicParsing
    $LATEST_VERSION = $PACKAGE_INFO."dist-tags".latest
    Write-Host "  最新版本: $LATEST_VERSION" -ForegroundColor Green
} catch {
    Write-Host "  ✗ 无法获取包信息，请检查网络连接" -ForegroundColor Red
    exit 1
}

# 递归获取所有依赖
Write-Host ""
Write-Host "[2/3] 分析依赖关系..." -ForegroundColor Yellow

function Get-AllDependencies {
    param(
        [string]$PackageName,
        [string]$Version,
        [hashtable]$Visited = @{},
        [int]$Depth = 0
    )

    $INDENT = "  " * $Depth
    $depKey = "${PackageName}@${Version}"

    if ($Visited.ContainsKey($depKey)) {
        return
    }
    $Visited[$depKey] = $true

    try {
        $url = "$NPM_REGISTRY/$($PackageName.Replace('@', ''))/$Version"
        $info = Invoke-RestMethod -Uri $url -UseBasicParsing

        # 获取 tarball URL
        $tarballUrl = $info.dist.tarball
        $scope = [PSCustomObject]@{
            PackageName = $PackageName
            Version = $Version
            TarballUrl = $tarballUrl
            FileName = $PackageName.Replace('@', '').Replace('/', '+') + "-$Version.tgz"
        }

        Write-Host "  ${INDENT}+ ${PackageName}@${Version}" -ForegroundColor Gray

        # 递归处理依赖
        if ($info.dependencies) {
            foreach ($dep in $info.dependencies.PSObject.Properties) {
                $depName = $dep.Name
                # 解析版本范围 (如 ^1.0.0)
                $depVersion = $dep.Value

                # 获取该包的准确版本
                try {
                    $depInfoUrl = "$NPM_REGISTRY/$($depName.Replace('@', ''))"
                    $depInfo = Invoke-RestMethod -Uri $depInfoUrl -UseBasicParsing

                    if ($depVersion -like '^*') {
                        $exactVersion = $depInfo."dist-tags".latest
                    } elseif ($depVersion -like '~*') {
                        $exactVersion = $depInfo.versions.PSObject.Properties.Name |
                            Where-Object { $_ -like "$($depVersion.Substring(1))*" } |
                            Select-Object -First 1
                    } else {
                        # 尝试精确匹配
                        $exactVersion = if ($depInfo.versions.$depVersion) { $depVersion } else { $depInfo."dist-tags".latest }
                    }

                    Get-AllDependencies -PackageName $depName -Version $exactVersion -Visited $Visited -Depth ($Depth + 1)
                } catch {
                    Write-Host "  ${INDENT}  ✗ 无法解析 ${depName}@${depVersion}" -ForegroundColor Red
                }
            }
        }

        return $scope
    } catch {
        Write-Host "  ${INDENT}  ✗ 无法获取 ${PackageName}@${Version}" -ForegroundColor Red
        return $null
    }
}

$PACKAGES = @{}
Get-AllDependencies -PackageName $PACKAGE_NAME -Version $LATEST_VERSION -Visited $PACKAGES

Write-Host ""
Write-Host "  共需下载 $($PACKAGES.Count) 个包" -ForegroundColor Cyan

# 下载所有包
Write-Host ""
Write-Host "[3/3] 下载包文件..." -ForegroundColor Yellow

$DOWNLOADED = 0
$FAILED = @()
$INDEX = 0

foreach ($pkg in $PACKAGES.Values) {
    $INDEX++
    $OUTPUT_FILE = Join-Path $NPM_DIR $pkg.FileName

    if (Test-Path $OUTPUT_FILE) {
        Write-Host "  [$INDEX/$($PACKAGES.Count)] 跳过 $($pkg.PackageName) - 已存在" -ForegroundColor DarkGreen
        $DOWNLOADED++
        continue
    }

    Write-Host "  [$INDEX/$($PACKAGES.Count)] 下载 $($pkg.PackageName)..." -ForegroundColor Gray

    try {
        # 使用用户代理避免被拒绝
        $ProgressPreference = 'SilentlyContinue'
        Invoke-WebRequest -Uri $pkg.TarballUrl -OutFile $OUTPUT_FILE -UseBasicParsing `
            -Headers @{ "User-Agent" = "npm/10.0.0 node/20.0.0" }
        $DOWNLOADED++
    } catch {
        $FAILED += $pkg.PackageName
        Write-Host "    ✗ 下载失败" -ForegroundColor Red
    }
}

# 保存包清单
$PACKAGE_LIST = $PACKAGES.Values | ForEach-Object { $_.FileName }
$PACKAGE_LIST | Out-File -FilePath (Join-Path $BASE_DIR "package-list.txt") -Encoding UTF8

# 生成安装脚本
$INSTALL_PS = @'
# Claude Code 离线安装脚本
$ErrorActionPreference = "Stop"

$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$NPM_DIR = Join-Path $SCRIPT_DIR "npm-packages"

Write-Host "====================================" -ForegroundColor Cyan
Write-Host "Claude Code 离线安装" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""

# 检查 Node.js
try {
    $NODE_VERSION = node --version
    Write-Host "✓ Node.js 已安装: $NODE_VERSION" -ForegroundColor Green
} catch {
    Write-Host "✗ 未检测到 Node.js" -ForegroundColor Red
    Write-Host "  请从 https://nodejs.org/ 下载并安装 Node.js" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "开始安装 Claude Code..." -ForegroundColor Yellow

# 离线安装
try {
    npm install -g (Get-ChildItem $NPM_DIR\*.tgz) --offline
    Write-Host ""
    Write-Host "✓ 安装完成!" -ForegroundColor Green
} catch {
    Write-Host ""
    Write-Host "离线安装失败，尝试在线安装..." -ForegroundColor Yellow
    npm install -g (Get-ChildItem $NPM_DIR\*.tgz)
}

Write-Host ""
Write-Host "验证安装:" -ForegroundColor Yellow
claude --version

Write-Host ""
Write-Host "按任意键退出..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
'@

Set-Content -Path (Join-Path $BASE_DIR "install-offline.ps1") -Value $INSTALL_PS -Encoding UTF8

# 完成
Write-Host ""
Write-Host "====================================" -ForegroundColor Cyan
Write-Host "下载完成!" -ForegroundColor Green
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "输出目录: $BASE_DIR" -ForegroundColor Yellow
Write-Host "成功下载: $DOWNLOADED / $($PACKAGES.Count) 个包" -ForegroundColor Green
if ($FAILED.Count -gt 0) {
    Write-Host "下载失败: $($FAILED.Count) 个" -ForegroundColor Red
}
Write-Host ""
Write-Host "下一步:" -ForegroundColor Yellow
Write-Host "  1. (可选) 从 https://nodejs.org/ 下载 Node.js 安装包放入 $OUTPUT_DIR" -ForegroundColor White
Write-Host "  2. 将 $OUTPUT_DIR 目录复制到离线电脑" -ForegroundColor White
Write-Host "  3. 在离线电脑上运行 install-offline.ps1 (需要 PowerShell)" -ForegroundColor White
Write-Host ""
