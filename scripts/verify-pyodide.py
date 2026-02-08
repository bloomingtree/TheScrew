#!/usr/bin/env python3
"""
验证 Pyodide 离线包完整性

使用方法:
    python scripts/verify-pyodide.py
"""

import json
import sys
from pathlib import Path

# 设置 UTF-8 编码输出（Windows 兼容）
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

# 配置
PYODIDE_VERSION = "0.29.3"
PROJECT_ROOT = Path(__file__).parent.parent
PYODIDE_DIR = PROJECT_ROOT / "public" / "assets" / "pyodide" / PYODIDE_VERSION / "full"

# 必需的核心文件
CORE_FILES = [
    "pyodide.js",
    "pyodide.asm.js",
    "pyodide.asm.data",
    "pyodide_asm.wasm",
    "pyodide-lock.json",
    "packages.json",
    "micropip.py",
]

# 必需的 Python 包
PYTHON_PACKAGES = [
    "openpyxl",
    "lxml",
    "defusedxml",
    "Pillow",
    "xlsxwriter",
    "python-pptx",
    "pypdf",
    "pdfplumber",
    "reportlab",
    "numpy",
    "pandas",
]

# 最小文件大小（字节）
MIN_FILE_SIZES = {
    "pyodide.js": 10_000,
    "pyodide.asm.js": 1_000_000,
    "pyodide.asm.data": 1_000_000,
    "pyodide_asm.wasm": 100_000,
    "pyodide-lock.json": 1_000,
    "packages.json": 1_000,
    "micropip.py": 10_000,
}


def format_size(size: int) -> str:
    """格式化文件大小"""
    for unit in ["B", "KB", "MB", "GB"]:
        if size < 1024:
            return f"{size:.1f} {unit}"
        size /= 1024
    return f"{size:.1f} TB"


def verify_core_files() -> bool:
    """验证核心文件"""
    print("\n" + "=" * 60)
    print("验证核心文件")
    print("=" * 60)

    all_ok = True
    total_size = 0

    for filename in CORE_FILES:
        filepath = PYODIDE_DIR / filename
        if filepath.exists():
            size = filepath.stat().st_size
            total_size += size
            min_size = MIN_FILE_SIZES.get(filename, 0)

            status = "✓"
            if size < min_size:
                status = "⚠"
                all_ok = False
                print(f"  {status} {filename:25s} {format_size(size):>10s} (太小，预期至少 {format_size(min_size)})")
            else:
                print(f"  {status} {filename:25s} {format_size(size):>10s}")
        else:
            print(f"  ✗ {filename:25s} 文件缺失!")
            all_ok = False

    print(f"\n  总大小: {format_size(total_size)}")
    return all_ok


def verify_packages() -> bool:
    """验证 Python 包"""
    print("\n" + "=" * 60)
    print("验证 Python 包")
    print("=" * 60)

    packages_json = PYODIDE_DIR / "packages.json"
    if not packages_json.exists():
        print("  ✗ packages.json 不存在!")
        return False

    try:
        with open(packages_json, encoding="utf-8") as f:
            packages = json.load(f)
    except json.JSONDecodeError as e:
        print(f"  ✗ packages.json 解析失败: {e}")
        return False

    all_ok = True
    packages_dir = PYODIDE_DIR / "packages"

    if not packages_dir.exists():
        print(f"  ✗ packages 目录不存在!")
        return False

    print(f"  packages.json 包含 {len(packages)} 个包")

    for pkg_name in PYTHON_PACKAGES:
        if pkg_name in packages:
            pkg_info = packages[pkg_name]
            files = pkg_info.get("files", [])
            version = pkg_info.get("version", "unknown")

            # 检查文件是否实际存在
            all_files_exist = True
            for file_name in files:
                file_path = packages_dir / file_name
                if not file_path.exists():
                    all_files_exist = False
                    break

            if all_files_exist:
                print(f"  ✓ {pkg_name:20s} v{version}")
            else:
                print(f"  ⚠ {pkg_name:20s} v{version} (文件不完整)")
                all_ok = False
        else:
            print(f"  ✗ {pkg_name:20s} 不在 packages.json 中")
            all_ok = False

    # 列出 packages 目录中的所有 .whl 文件
    whl_files = list(packages_dir.glob("*.whl"))
    print(f"\n  packages 目录包含 {len(whl_files)} 个 .whl 文件")

    return all_ok


def verify_lock_file() -> bool:
    """验证 pyodide-lock.json"""
    print("\n" + "=" * 60)
    print("验证 pyodide-lock.json")
    print("=" * 60)

    lock_file = PYODIDE_DIR / "pyodide-lock.json"
    if not lock_file.exists():
        print("  ✗ pyodide-lock.json 不存在!")
        return False

    try:
        with open(lock_file, encoding="utf-8") as f:
            lock_data = json.load(f)
    except json.JSONDecodeError as e:
        print(f"  ✗ pyodide-lock.json 解析失败: {e}")
        return False

    # 检查版本
    lock_version = lock_data.get("info", {}).get("version", "")
    if lock_version == PYODIDE_VERSION:
        print(f"  ✓ 版本匹配: {lock_version}")
    else:
        print(f"  ⚠ 版本不匹配: lock={lock_version}, expected={PYODIDE_VERSION}")

    # 检查包数量
    packages = lock_data.get("packages", {})
    print(f"  ✓ 包数量: {len(packages)}")

    return True


def print_summary(core_ok: bool, packages_ok: bool, lock_ok: bool):
    """打印验证摘要"""
    print("\n" + "=" * 60)
    print("验证摘要")
    print("=" * 60)

    status = {
        "core_files": "✓ 通过" if core_ok else "✗ 失败",
        "python_packages": "✓ 通过" if packages_ok else "✗ 失败",
        "lock_file": "✓ 通过" if lock_ok else "✗ 失败",
    }

    for key, value in status.items():
        print(f"  {key:20s}: {value}")

    all_ok = core_ok and packages_ok and lock_ok

    print("\n" + "=" * 60)
    if all_ok:
        print("✓ 所有验证通过！Pyodide 离线环境配置正确。")
        print("\n下一步:")
        print("  1. 启动开发服务器: npm run dev")
        print("  2. 测试 Python 执行功能")
        print("  3. 构建应用: npm run build")
    else:
        print("✗ 验证失败！请检查上述问题。")
        print("\n建议:")
        print("  1. 运行下载脚本: python download-pyodide.py")
        print("  2. 检查网络连接和镜像源")
        print("  3. 删除损坏的文件后重新下载")
    print("=" * 60)

    return 0 if all_ok else 1


def main():
    """主函数"""
    print("=" * 60)
    print("Pyodide 离线包验证工具")
    print("=" * 60)
    print(f"版本: {PYODIDE_VERSION}")
    print(f"目录: {PYODIDE_DIR}")

    if not PYODIDE_DIR.exists():
        print(f"\n✗ 目录不存在: {PYODIDE_DIR}")
        print("\n请先运行下载脚本:")
        print("  python download-pyodide.py")
        return 1

    core_ok = verify_core_files()
    lock_ok = verify_lock_file()
    packages_ok = verify_packages()

    return print_summary(core_ok, packages_ok, lock_ok)


if __name__ == "__main__":
    sys.exit(main())
