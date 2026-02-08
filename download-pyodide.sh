#!/bin/bash
# Pyodide 离线部署包下载脚本 (bash 版本)
#
# 使用方法:
#     bash download-pyodide.sh

set -e

PYODIDE_VERSION="0.29.3"
# 国内镜像优先（staticfile, npmmirror）
MIRROR_URLS=(
    "https://cdn.staticfile.net/pyodide/${PYODIDE_VERSION}/full/"
    "https://registry.npmmirror.com/pyodide/${PYODIDE_VERSION}/full/"
    "https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/"
    "https://unpkg.com/pyodide@${PYODIDE_VERSION}/full/"
)
OUTPUT_DIR="public/assets/pyodide/${PYODIDE_VERSION}/full"

# 需要下载的 Python 包
PACKAGES=(
    "openpyxl"
    "lxml"
    "defusedxml"
    "Pillow"
    "xlsxwriter"
    "python-pptx"
    "pypdf"
    "pdfplumber"
    "reportlab"
    "numpy"
    "pandas"
)

echo "============================================================"
echo "Pyodide Offline Package Downloader"
echo "============================================================"
echo "Version: ${PYODIDE_VERSION}"
echo "Output: ${OUTPUT_DIR}"
echo ""

# 创建输出目录
mkdir -p "${OUTPUT_DIR}"
mkdir -p "${OUTPUT_DIR}/packages"

# 选择可用的镜像源
echo "=== Detecting available mirrors ==="
BASE_URL=""
for url in "${MIRROR_URLS[@]}"; do
    echo "  Testing: ${url}"
    if curl -s --head --connect-timeout 10 "${url}packages.json" | head -n 1 | grep -q "200"; then
        echo "  ✓ Mirror is accessible"
        BASE_URL="${url}"
        break
    else
        echo "  ✗ Failed"
    fi
done

if [ -z "$BASE_URL" ]; then
    echo "Error: No available mirror found!"
    exit 1
fi

echo ""
echo "Using mirror: ${BASE_URL}"
echo ""

# 下载核心文件
echo "=== Downloading Pyodide core files ==="
CORE_FILES=(
    "pyodide.js"
    "pyodide.asm.js"
    "pyodide.asm.data"
    "pyodide_asm.wasm"
    "pyodide-lock.json"
    "packages.json"
    "micropip.py"
)

for file in "${CORE_FILES[@]}"; do
    echo "  Downloading: ${file}"
    curl -L -o "${OUTPUT_DIR}/${file}" "${BASE_URL}${file}"
done

echo "Downloaded ${#CORE_FILES[@]} core files"
echo ""

# 下载包索引并解析
echo "=== Downloading Python packages ==="
echo "  Reading package index..."

# 使用 Python 解析 JSON 并下载包
python3 << 'PYTHON_SCRIPT'
import json
import sys
from pathlib import Path
from urllib.request import urlretrieve

OUTPUT_DIR = Path("${OUTPUT_DIR}")
PACKAGES = ${PACKAGES}
BASE_URL = "${BASE_URL}"

packages_json = OUTPUT_DIR / "packages.json"
with open(packages_json) as f:
    packages = json.load(f)

downloaded = 0
for pkg_name in PACKAGES:
    if pkg_name not in packages:
        print(f"  Warning: {pkg_name} not found")
        continue

    pkg_info = packages[pkg_name]
    print(f"\n  Processing: {pkg_name}")
    print(f"    Version: {pkg_info.get('version', 'unknown')}")

    for file_name in pkg_info.get("files", []):
        file_url = f"{BASE_URL}packages/{file_name}"
        file_dest = OUTPUT_DIR / "packages" / file_name
        if not file_dest.exists():
            print(f"    Downloading: {file_name}")
            urlretrieve(file_url, str(file_dest))
            downloaded += 1

print(f"\nDownloaded {downloaded} package files")
PYTHON_SCRIPT

echo ""
echo "============================================================"
echo "DOWNLOAD SUMMARY"
echo "============================================================"
echo "Pyodide Version: ${PYODIDE_VERSION}"
echo "Output Directory: ${OUTPUT_DIR}"
echo ""
echo "Packages included:"
for i in "${!PACKAGES[@]}"; do
    echo "  $((i+1)). ${PACKAGES[$i]}"
done
echo "============================================================"
echo ""
echo "Next steps:"
echo "1. Verify all files are present"
echo "2. Build the application: npm run build"
echo "3. Test Python execution in offline mode"
echo "============================================================"
echo ""
echo "Download complete!"
