/**
 * scripts/bundle.js — 把 officecli-lite 打成单文件 bundle，同步到 .config/bin/
 *
 * 用法：
 *   node scripts/bundle.js                # 输出到 ../.config/bin/officecli-bundle.js
 *   node scripts/bundle.js /path/out.js   # 自定义输出
 *
 * 平台说明：
 *   - 使用 esbuild API（依赖已在 devDependencies）
 *   - target=node12 保证 Win7 上的 node-v12.exe 能跑（降级 ?? 等现代语法）
 *   - 直接写文件并 prepend shebang，避免 shell 转义 `!` 的坑
 */

const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '..');
const ENTRY = path.join(ROOT, 'src/cli.ts');

// 默认输出到主项目的 .config/bin/officecli-bundle.js
const DEFAULT_OUT = path.resolve(ROOT, '..', '.config', 'bin', 'officecli-bundle.js');
const OUT = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_OUT;

const SHEBANG = '#!/usr/bin/env node\n';

async function main() {
  // 确保输出目录存在
  fs.mkdirSync(path.dirname(OUT), { recursive: true });

  // 用 esbuild 打包
  const result = await esbuild.build({
    entryPoints: [ENTRY],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node12',
    minify: true,
    write: false, // 自己写文件，避免 banner 转义问题
    sourcemap: false,
    logLevel: 'warning',
  });

  if (result.errors.length > 0) {
    console.error('esbuild errors:', result.errors);
    process.exit(1);
  }

  const code = result.outputFiles[0].text;
  // esbuild 会把 src/cli.ts 顶部的 shebang 上提到 bundle 最前，避免重复 prepend
  const finalContent = code.startsWith('#!') ? code : SHEBANG + code;

  fs.writeFileSync(OUT, finalContent, 'utf-8');
  const sizeKB = (Buffer.byteLength(finalContent, 'utf-8') / 1024).toFixed(1);
  console.log(`✅ Bundled to ${OUT} (${sizeKB} KB)`);
}

main().catch(err => {
  console.error('Bundle failed:', err);
  process.exit(1);
});
