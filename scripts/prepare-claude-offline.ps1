#!/usr/bin/env pwsh
# Claude Code 离线安装包准备脚本
# 在有网电脑上运行此脚本，下载所有必要的文件

$ErrorActionPreference = "Stop"

# 配置
$OUTPUT_DIR = "claude-code-offline"
$CLAUDE_CODE_VERSION = "latest"  # 或指定版本如 "2.1.15"
$NODE_VERSION = "v20.18.2"
$NODEJS_URL = "https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-x64.msi"

Write-Host "====================================" -ForegroundColor Cyan
Write-Host "Claude Code 离线安装包准备工具" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""

# 创建输出目录
$BASE_DIR = Join-Path $PSScriptRoot $OUTPUT_DIR
$NODEJS_DIR = Join-Path $BASE_DIR "nodejs-installer"
$NPM_DIR = Join-Path $BASE_DIR "npm-packages"

New-Item -ItemType Directory -Force -Path $NODEJS_DIR | Out-Null
New-Item -ItemType Directory -Force -Path $NPM_DIR | Out-Null

# 临时目录用于 npm 安装
$TEMP_DIR = Join-Path $env:TEMP "claude-offline-prepare"
New-Item -ItemType Directory -Force -Path $TEMP_DIR | Out-Null

try {
    # ==================== 步骤 1: 下载 Node.js ====================
    Write-Host "[1/4] 下载 Node.js 安装包..." -ForegroundColor Yellow
    $NODEJS_OUTPUT = Join-Path $NODEJS_DIR "node-${NODE_VERSION}-x64.msi"

    if (Test-Path $NODEJS_OUTPUT) {
        Write-Host "  ✓ Node.js 安装包已存在，跳过下载" -ForegroundColor Green
    } else {
        Write-Host "  正在下载: $NODEJS_URL" -ForegroundColor Gray
        Invoke-WebRequest -Uri $NODEJS_URL -OutFile $NODEJS_OUTPUT -UseBasicParsing
        Write-Host "  ✓ 下载完成: $(Split-Path $NODEJS_OUTPUT -Leaf)" -ForegroundColor Green
    }

    # ==================== 步骤 2: 安装 Claude Code 到临时目录 ====================
    Write-Host ""
    Write-Host "[2/4] 获取 Claude Code 依赖信息..." -ForegroundColor Yellow

    $TEMP_PROJECT = Join-Path $TEMP_DIR "temp-project"
    New-Item -ItemType Directory -Force -Path $TEMP_PROJECT | Out-Null

    # 创建临时 package.json
    $PACKAGE_JSON = @{
        name = "claude-code-offline-temp"
        version = "1.0.0"
        private = $true
        dependencies = @{
            "@anthropic-ai/claude-code" = $CLAUDE_CODE_VERSION
        }
    } | ConvertTo-Json -Depth 10

    Set-Content -Path (Join-Path $TEMP_PROJECT "package.json") -Value $PACKAGE_JSON

    # ==================== 步骤 3: 下载所有依赖包 ====================
    Write-Host ""
    Write-Host "[3/4] 下载 npm 包及所有依赖..." -ForegroundColor Yellow

    Push-Location $TEMP_PROJECT
    try {
        # 使用 npm pack --pack-destination 获取所有依赖
        # 首先安装生成 package-lock.json
        npm install --no-save --no-package-lock 2>$null

        # 获取完整依赖列表
        $DEPS_JSON = npm ls --all --json --long 2>$null | ConvertFrom-Json

        # 获取所有需要下载的包
        $PACKS_TO_DOWNLOAD = @()
        $PACKS_TO_DOWNLOAD += "@anthropic-ai/claude-code@$CLAUDE_CODE_VERSION"

        function Get-AllDeps {
            param($Dep, $Visited = @{})

            if ($null -eq $Dep -or $Dep.PSObject.Properties.Name -notcontains "dependencies") {
                return
            }

            foreach ($key in $Dep.dependencies.PSObject.Properties.Name) {
                $pkg = $Dep.dependencies.$key
                $pkgName = $key
                $pkgVersion = $pkg.version

                $depKey = "${pkgName}@${pkgVersion}"
                if (-not $Visited.ContainsKey($depKey)) {
                    $Visited[$depKey] = $true
                    $PACKS_TO_DOWNLOAD += "${pkgName}@${pkgVersion}"
                    Get-AllDeps -Dep $pkg -Visited $Visited
                }
            }
        }

        if ($DEPS_JSON.dependencies) {
            foreach ($key in $DEPS_JSON.dependencies.PSObject.Properties.Name) {
                Get-AllDeps -Dep $DEPS_JSON.dependencies.$key
            }
        }

        Write-Host "  找到 $($PACKS_TO_DOWNLOAD.Count) 个包需要下载" -ForegroundColor Gray

        # 下载每个包
        $PROGRESS = 0
        $DOWNLOADED = 0
        $FAILED = @()

        foreach ($PACK_SPEC in $PACKS_TO_DOWNLOAD) {
            $PROGRESS++
            Write-Host "  [$PROGRESS/$($PACKS_TO_DOWNLOAD.Count)] 下载 $PACK_SPEC..." -ForegroundColor Gray

            try {
                # 使用 npm pack 下载 .tgz
                $OUTPUT = npm pack $PACK_SPEC --pack-destination $TEMP_DIR --silent 2>&1

                if ($LASTEXITCODE -eq 0 -and $OUTPUT) {
                    $TGZ_FILE = $OUTPUT.Trim()
                    if (Test-Path $TGZ_FILE) {
                        $DEST = Join-Path $NPM_DIR (Split-Path $TGZ_FILE -Leaf)
                        Move-Item -Path $TGZ_FILE -Destination $DEST -Force
                        $DOWNLOADED++
                        Write-Host "    ✓ 下载成功" -ForegroundColor Green
                    }
                } else {
                    $FAILED += $PACK_SPEC
                    Write-Host "    ✗ 下载失败" -ForegroundColor Red
                }
            } catch {
                $FAILED += $PACK_SPEC
                Write-Host "    ✗ 下载失败: $_" -ForegroundColor Red
            }
        }

        Write-Host ""
        Write-Host "  下载统计:" -ForegroundColor Cyan
        Write-Host "    成功: $DOWNLOADED 个" -ForegroundColor Green
        if ($FAILED.Count -gt 0) {
            Write-Host "    失败: $($FAILED.Count) 个" -ForegroundColor Red
            Write-Host "    失败列表:" -ForegroundColor Red
            $FAILED | ForEach-Object { Write-Host "      - $_" -ForegroundColor Red }
        }

    } finally {
        Pop-Location
    }

    # ==================== 步骤 4: 生成依赖清单 ====================
    Write-Host ""
    Write-Host "[4/4] 生成安装脚本..." -ForegroundColor Yellow

    # 获取所有 .tgz 文件列表
    $TGZ_FILES = Get-ChildItem -Path $NPM_DIR -Filter "*.tgz" | Select-Object -ExpandProperty Name

    # 保存包列表
    $TGZ_FILES | Out-File -FilePath (Join-Path $BASE_DIR "package-list.txt") -Encoding UTF8

    # 生成离线安装脚本 (PowerShell)
    $INSTALL_PS = @'
# Claude Code 离线安装脚本
# 在离线电脑上运行

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
    Write-Host "✗ 未检测到 Node.js，请先安装 nodejs-installer 目录中的安装包" -ForegroundColor Red
    Write-Host "  安装位置: $SCRIPT_DIR\nodejs-installer" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "开始安装 Claude Code..." -ForegroundColor Yellow

# 获取所有 .tgz 文件
$TGZ_FILES = Get-ChildItem -Path $NPM_DIR -Filter "*.tgz"

if ($TGZ_FILES.Count -eq 0) {
    Write-Host "✗ 未找到任何 .tgz 文件" -ForegroundColor Red
    exit 1
}

Write-Host "找到 $($TGZ_FILES.Count) 个包待安装" -ForegroundColor Gray
Write-Host ""

# 离线安装所有包
try {
    npm install -g (Get-ChildItem $NPM_DIR\*.tgz) --offline
    Write-Host ""
    Write-Host "✓ 安装完成!" -ForegroundColor Green
    Write-Host ""
    Write-Host "验证安装:" -ForegroundColor Yellow
    claude --version
} catch {
    Write-Host ""
    Write-Host "✗ 安装失败，尝试非离线模式..." -ForegroundColor Yellow
    npm install -g (Get-ChildItem $NPM_DIR\*.tgz)
    Write-Host ""
    Write-Host "✓ 安装完成!" -ForegroundColor Green
    Write-Host ""
    Write-Host "验证安装:" -ForegroundColor Yellow
    claude --version
}

Write-Host ""
Write-Host "按任意键退出..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
'@

    Set-Content -Path (Join-Path $BASE_DIR "install-offline.ps1") -Value $INSTALL_PS -Encoding UTF8

    # 生成离线安装脚本 (Bash)
    $INSTALL_SH = @'
#!/bin/bash
# Claude Code 离线安装脚本 (Linux/Mac)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
NPM_DIR="$SCRIPT_DIR/npm-packages"

echo "===================================="
echo "Claude Code 离线安装"
echo "===================================="
echo ""

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "✗ 未检测到 Node.js，请先安装"
    echo "  下载地址: https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node --version)
echo "✓ Node.js 已安装: $NODE_VERSION"
echo ""

echo "开始安装 Claude Code..."

# 离线安装所有包
cd "$NPM_DIR"
npm install -g *.tgz --offline

if [ $? -ne 0 ]; then
    echo ""
    echo "✗ 离线安装失败，尝试非离线模式..."
    npm install -g *.tgz
fi

echo ""
echo "✓ 安装完成!"
echo ""
echo "验证安装:"
claude --version
'@

    Set-Content -Path (Join-Path $BASE_DIR "install-offline.sh") -Value $INSTALL_SH -Encoding UTF8

    # ==================== 完成 ====================
    Write-Host ""
    Write-Host "====================================" -ForegroundColor Cyan
    Write-Host "准备完成!" -ForegroundColor Green
    Write-Host "====================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "输出目录: $BASE_DIR" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "目录结构:" -ForegroundColor Yellow
    Write-Host "  $OUTPUT_DIR/" -ForegroundColor White
    Write-Host "  ├── nodejs-installer/    # Node.js 安装包" -ForegroundColor Gray
    Write-Host "  ├── npm-packages/        # npm 包文件 ($DOWNLOADED 个)" -ForegroundColor Gray
    Write-Host "  ├── install-offline.ps1  # Windows 安装脚本" -ForegroundColor Gray
    Write-Host "  ├── install-offline.sh   # Linux/Mac 安装脚本" -ForegroundColor Gray
    Write-Host "  └── package-list.txt     # 包清单" -ForegroundColor Gray
    Write-Host ""
    Write-Host "下一步:" -ForegroundColor Yellow
    Write-Host "  1. 将 $OUTPUT_DIR 目录复制到 U 盘或移动硬盘" -ForegroundColor White
    Write-Host "  2. 在离线电脑上运行对应的安装脚本" -ForegroundColor White
    Write-Host ""

} catch {
    Write-Host ""
    Write-Host "✗ 发生错误: $_" -ForegroundColor Red
    Write-Host $_.ScriptStackTrace -ForegroundColor Red
    exit 1

} finally {
    # 清理临时目录
    if (Test-Path $TEMP_DIR) {
        Remove-Item -Path $TEMP_DIR -Recurse -Force -ErrorAction SilentlyContinue
    }
}
