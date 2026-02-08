#!/usr/bin/env python3
"""
Pyodide 离线部署包下载脚本

支持多个 CDN 镜像源自动切换

使用方法:
    python download-pyodide.py
"""

import os
import sys
import json
from pathlib import Path
from urllib.request import urlretrieve, urlopen
from urllib.error import URLError
import socket
import ssl

# 禁用 SSL 验证（仅用于下载可信的 Pyodide 文件）
ssl._create_default_https_context = ssl._create_unverified_context

# 配置
PYODIDE_VERSION = "0.29.3"

# 多个 CDN 镜像源（国内优先）
MIRROR_URLS = [
    # 国内镜像（优先）- 使用正确的 URL 格式
    f"https://registry.npmmirror.com/pyodide/-/pyodide-{PYODIDE_VERSION}.tgz",  # npmmirror 完整包
    f"https://cdn.jsdelivr.net/npm/pyodide@{PYODIDE_VERSION}/full/",  # jsDelivr npm
    # 国际镜像（备用）
    f"https://cdn.jsdelivr.net/pyodide/v{PYODIDE_VERSION}/full/",
    f"https://unpkg.com/pyodide@{PYODIDE_VERSION}/full/",
    # GitHub releases（最后备选）
    f"https://github.com/pyodide/pyodide/releases/download/{PYODIDE_VERSION}/pyodide-{PYODIDE_VERSION}.tar.bz2",
]

OUTPUT_DIR = Path("public/assets/pyodide") / PYODIDE_VERSION / "full"

# 需要下载的 Python 包
PYTHON_PACKAGES = [
    # 核心包
    "openpyxl",
    "lxml",
    "defusedxml",
    "Pillow",
    "xlsxwriter",
    # Office 处理
    "python-pptx",
    "pypdf",
    "pdfplumber",
    "reportlab",
    # 数据分析
    "numpy",
    "pandas",
]

def test_mirror(url: str) -> bool:
    """测试镜像源是否可访问"""
    try:
        print(f"  Testing: {url}")
        response = urlopen(f"{url}packages.json", timeout=10)
        data = response.read()
        if len(data) > 1000:
            print(f"  [OK] Mirror is accessible")
            return True
    except Exception as e:
        print(f"  [FAIL] Failed: {e}")
    return False

def select_mirror() -> str:
    """选择可用的镜像源"""
    print("\n=== Detecting available mirrors ===")
    for i, mirror in enumerate(MIRROR_URLS, 1):
        print(f"\nMirror {i}/{len(MIRROR_URLS)}: {mirror}")
        if test_mirror(mirror):
            return mirror
    raise Exception("No available mirror found!")

def download_file(url: str, dest: Path) -> bool:
    """下载单个文件，显示进度"""
    try:
        print(f"  Downloading: {Path(url).name}")
        dest.parent.mkdir(parents=True, exist_ok=True)

        def show_progress(block_num, block_size, total_size):
            downloaded = block_num * block_size
            if total_size > 0:
                percent = min(100, downloaded * 100 // total_size)
                mb_downloaded = downloaded / (1024 * 1024)
                mb_total = total_size / (1024 * 1024)
                print(f"\r    {percent:.0f}% ({mb_downloaded:.1f}MB / {mb_total:.1f}MB)", end='', flush=True)

        urlretrieve(url, str(dest), show_progress)
        print()  # 换行
        return True
    except URLError as e:
        print(f"  Error downloading {url}: {e}")
        return False

def download_pyodide_core(base_url: str):
    """下载 Pyodide 核心文件"""
    print("\n=== Downloading Pyodide core files ===")

    # Pyodide 核心文件列表
    core_files = [
        "pyodide.js",
        "pyodide.asm.js",
        "pyodide.asm.data",
        "pyodide_asm.wasm",
        "pyodide-lock.json",  # 0.29.0+ 必需
        "packages.json",
        "micropip.py",
    ]

    success_count = 0
    for filename in core_files:
        url = f"{base_url}{filename}"
        dest = OUTPUT_DIR / filename
        if not dest.exists():
            if download_file(url, dest):
                success_count += 1
        else:
            print(f"  Skipping (already exists): {filename}")
            success_count += 1

    print(f"Downloaded {success_count}/{len(core_files)} core files")
    return success_count > 0

def download_pyodide_packages(base_url: str):
    """下载 Python 包文件"""
    print("\n=== Downloading Python packages ===")

    # 读取包索引
    packages_json = OUTPUT_DIR / "packages.json"
    if not packages_json.exists():
        print("Error: packages.json not found!")
        return False

    with open(packages_json) as f:
        packages = json.load(f)

    packages_dir = OUTPUT_DIR / "packages"
    packages_dir.mkdir(parents=True, exist_ok=True)

    downloaded = 0
    total_size = 0
    for pkg_name in PYTHON_PACKAGES:
        if pkg_name not in packages:
            print(f"  Warning: {pkg_name} not found in packages.json")
            continue

        pkg_info = packages[pkg_name]
        pkg_size = pkg_info.get("package_size", 0)
        total_size += pkg_size

        print(f"\n  {pkg_name} ({pkg_size / (1024*1024):.1f}MB)")
        print(f"    Version: {pkg_info.get('version', 'unknown')}")
        print(f"    Files: {len(pkg_info.get('files', []))}")

        # 下载包的 .whl 文件和依赖
        for file_name in pkg_info.get("files", []):
            file_url = f"{base_url}packages/{file_name}"
            file_dest = packages_dir / file_name
            if not file_dest.exists():
                if download_file(file_url, file_dest):
                    downloaded += 1
            else:
                print(f"    [OK] Already exists: {file_name}")

    print(f"\nDownloaded {downloaded} package files ({total_size / (1024*1024):.1f}MB)")
    return True

def create_version_file(base_url: str):
    """创建版本信息文件"""
    version_info = {
        "pyodide_version": PYODIDE_VERSION,
        "packages": PYTHON_PACKAGES,
        "mirror_url": base_url,
        "total_packages": len(PYTHON_PACKAGES),
    }

    version_file = OUTPUT_DIR / "version.json"
    with open(version_file, "w") as f:
        json.dump(version_info, f, indent=2)

    print(f"Created version file: {version_file}")

def print_summary(base_url: str):
    """打印下载摘要"""
    print("\n" + "=" * 60)
    print("DOWNLOAD SUMMARY")
    print("=" * 60)
    print(f"Pyodide Version: {PYODIDE_VERSION}")
    print(f"Mirror Used: {base_url}")
    print(f"Output Directory: {OUTPUT_DIR.absolute()}")
    print(f"\nPackages included:")
    for i, pkg in enumerate(PYTHON_PACKAGES, 1):
        print(f"  {i:2d}. {pkg}")
    print("=" * 60)
    print("\nNext steps:")
    print("1. Verify all files are present in the output directory")
    print("2. Build the application: npm run build")
    print("3. Test Python execution in offline mode")
    print("=" * 60)

def main():
    """主函数"""
    print("=" * 60)
    print("Pyodide Offline Package Downloader")
    print("=" * 60)
    print(f"Version: {PYODIDE_VERSION}")
    print(f"Output: {OUTPUT_DIR}")
    print()

    # 设置超时（国内网络可能较慢）
    socket.setdefaulttimeout(60)

    # 检查输出目录
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # 选择可用的镜像源
    try:
        base_url = select_mirror()
    except Exception as e:
        print(f"\nError: {e}")
        print("\nPlease check your network connection and try again.")
        print("\nAlternative: Download manually from:")
        print("  https://pyodide.org/en/stable/installation.html")
        sys.exit(1)

    print(f"\nUsing mirror: {base_url}")

    # 下载核心文件
    if not download_pyodide_core(base_url):
        print("\nError: Failed to download Pyodide core files")
        sys.exit(1)

    # 下载 Python 包
    if not download_pyodide_packages(base_url):
        print("\nError: Failed to download package files")
        sys.exit(1)

    # 创建版本文件
    create_version_file(base_url)

    # 打印摘要
    print_summary(base_url)

    print("\nDownload complete!")

if __name__ == "__main__":
    main()
