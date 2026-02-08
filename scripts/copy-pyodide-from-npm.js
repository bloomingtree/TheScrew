#!/usr/bin/env node
/**
 * 从 node_modules 复制 Pyodide 文件到 public 目录
 *
 * 这是一个临时解决方案，当网络无法下载完整的 Pyodide 发行版时使用。
 * 注意：npm 版本的 pyodide 只包含核心文件，不包含 packages.json 和 Python 包。
 */

const fs = require('fs');
const path = require('path');

const PYODIDE_VERSION = '0.29.3';
const PROJECT_ROOT = path.resolve(__dirname, '..');
const SOURCE_DIR = path.join(PROJECT_ROOT, 'node_modules', 'pyodide');
const TARGET_DIR = path.join(PROJECT_ROOT, 'public', 'assets', 'pyodide', PYODIDE_VERSION, 'full');

// 需要复制的文件
const FILES_TO_COPY = [
    'pyodide.js',
    'pyodide.asm.js',
    'pyodide.asm.wasm',
    'pyodide-lock.json',
    'python_stdlib.zip',
];

console.log('='.repeat(60));
console.log('从 node_modules 复制 Pyodide 文件');
console.log('='.repeat(60));
console.log(`源目录: ${SOURCE_DIR}`);
console.log(`目标目录: ${TARGET_DIR}`);
console.log();

// 检查源目录
if (!fs.existsSync(SOURCE_DIR)) {
    console.error('错误: node_modules/pyodide 不存在!');
    console.error('请先运行: npm install');
    process.exit(1);
}

// 创建目标目录
fs.mkdirSync(TARGET_DIR, { recursive: true });

// 复制文件
let copiedCount = 0;
const missingFiles = [];

for (const file of FILES_TO_COPY) {
    const sourcePath = path.join(SOURCE_DIR, file);
    const targetPath = path.join(TARGET_DIR, file);

    if (fs.existsSync(sourcePath)) {
        const stats = fs.statSync(sourcePath);
        const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

        fs.copyFileSync(sourcePath, targetPath);
        copiedCount++;

        console.log(`  [OK] ${file} (${sizeMB} MB)`);
    } else {
        console.log(`  [MISS] ${file}`);
        missingFiles.push(file);
    }
}

console.log();
console.log(`已复制 ${copiedCount}/${FILES_TO_COPY.length} 个文件`);

if (missingFiles.length > 0) {
    console.log(`缺失的文件: ${missingFiles.join(', ')}`);
}

// 创建 packages 目录（空目录）
const packagesDir = path.join(TARGET_DIR, 'packages');
if (!fs.existsSync(packagesDir)) {
    fs.mkdirSync(packagesDir, { recursive: true });
    console.log('  [创建] packages/ 目录（空）');
}

// 创建最小的 packages.json
const packagesJsonPath = path.join(TARGET_DIR, 'packages.json');
if (!fs.existsSync(packagesJsonPath)) {
    const minimalPackagesJson = {
        "info": {
            "arch": "wasm",
            "package_manager": "micropip",
            "platform": "browser",
            "python": "3.11",
            "version": PYODIDE_VERSION
        },
        "packages": {}
    };
    fs.writeFileSync(packagesJsonPath, JSON.stringify(minimalPackagesJson, null, 2));
    console.log('  [创建] packages.json（最小版本）');
}

// 创建 version.json
const versionJsonPath = path.join(TARGET_DIR, 'version.json');
const versionInfo = {
    pyodide_version: PYODIDE_VERSION,
    source: 'node_modules',
    note: '从 npm 安装的 pyodide 复制，仅包含核心文件',
    missing_files: [
        'pyodide.asm.data',
        'micropip.py',
        '完整的 packages.json',
        'packages/*.whl (Python 包)'
    ],
    limitations: [
        '无法加载额外的 Python 包',
        'numpy, pandas 等包不可用'
    ]
};
fs.writeFileSync(versionJsonPath, JSON.stringify(versionInfo, null, 2));

console.log();
console.log('='.repeat(60));
console.log('复制完成!');
console.log('='.repeat(60));
console.log();
console.log('注意事项:');
console.log('1. 这是临时方案，仅包含 Pyodide 核心');
console.log('2. 无法加载 Python 包（numpy, pandas, openpyxl 等）');
console.log('3. 如需完整功能，请参考 PYODIDE_OFFLINE_SETUP.md');
console.log();
console.log('下一步:');
console.log('  1. 运行: npm run dev');
console.log('  2. 测试 Python 执行功能');
console.log('  3. 参考 PYODIDE_OFFLINE_SETUP.md 获取完整版');
console.log('='.repeat(60));
