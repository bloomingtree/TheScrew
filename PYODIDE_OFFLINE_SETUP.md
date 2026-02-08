# Pyodide 离线环境配置指南

## 当前状态

- **目标版本**: 0.29.3
- **网络问题**: 无法访问外部 CDN (jsDelivr, unpkg, GitHub 等)
- **替代方案**: 使用已安装的 npm 包 + 手动下载

---

## 方案 A: 从 node_modules 复制（部分可用）

npm 已安装 pyodide@0.29.3，但只包含核心文件，缺少 packages.json 和 Python 包。

### 已有的文件（在 node_modules/pyodide/）
- pyodide.js
- pyodide.asm.js
- pyodide.asm.wasm
- pyodide-lock.json
- python_stdlib.zip

### 缺少的文件
- pyodide.asm.data
- packages.json
- micropip.py
- packages/*.whl（Python 包）

### 复制命令
```bash
# 创建目标目录
mkdir -p public/assets/pyodide/v0.29.3/full

# 复制核心文件
cp node_modules/pyodide/pyodide.js public/assets/pyodide/v0.29.3/full/
cp node_modules/pyodide/pyodide.asm.js public/assets/pyodide/v0.29.3/full/
cp node_modules/pyodide/pyodide.asm.wasm public/assets/pyodide/v0.29.3/full/
cp node_modules/pyodide/pyodide-lock.json public/assets/pyodide/v0.29.3/full/
```

**注意**: 此方案只能加载 Pyodide 核心，无法加载 Python 包（numpy, pandas 等）。

---

## 方案 B: 手动下载完整版（推荐）

### 方法 1: 从 Gitee 镜像下载（国内推荐）

```bash
# Gitee 上的 Pyodide 镜像
# https://gitee.com/mirrors/pyodide/releases

# 下载链接（示例）
wget https://gitee.com/mirrors/pyodide/releases/download/v0.29.3/pyodide-v0.29.3.tar.bz2

# 或使用浏览器下载后放到项目目录
```

### 方法 2: 使用代理/VPN 下载

1. 配置代理或连接 VPN
2. 从官方源下载：
   - https://github.com/pyodide/pyodide/releases/download/v0.29.3/pyodide-v0.29.3.tar.bz2
   - 或 https://cdn.jsdelivr.net/pyodide/v0.29.3/full/

### 方法 3: 从其他电脑复制

如果有可以访问外网的电脑：
1. 在该电脑上运行 `python download-pyodide.py`
2. 将生成的 `public/assets/pyodide/v0.29.3/` 目录复制到当前电脑

---

## 方案 C: 降级到可用的版本

如果 0.29.3 无法下载，可以尝试：
1. 使用已有的 0.26.2 版本（需要正确下载）
2. 检查国内镜像是否有其他版本

---

## 下载后的操作

### 1. 解压并放置文件

```bash
# 如果下载的是 tar.bz2 文件
tar -xjf pyodide-v0.29.3.tar.bz2

# 复制到目标位置
cp -r pyodide-v0.29.3/* public/assets/pyodide/v0.29.3/full/
```

### 2. 验证下载

```bash
python scripts/verify-pyodide.py
```

### 3. 测试运行

```bash
npm run dev
```

在浏览器控制台测试：
```javascript
const pyodide = await loadPyodide({ indexURL: './assets/pyodide/v0.29.3/full/' })
await pyodide.loadPackage(['numpy'])
```

---

## 临时解决方案：在线 CDN

如果离线环境暂时无法配置，可以先使用在线 CDN：

**修改 `src/utils/PyodideExecutor.ts:45`**:
```typescript
// 临时使用在线 CDN
this.indexURL = 'https://cdn.jsdelivr.net/pyodide/v0.29.3/full/';
```

**注意**: 需要网络连接，且在国内可能速度较慢。

---

## 下一步

请选择一个方案：
1. **方案 A**: 立即可用，但功能受限（无 Python 包）
2. **方案 B**: 需要下载，但功能完整
3. **方案 C**: 降级版本
4. **临时方案**: 使用在线 CDN

建议先尝试方案 A 让应用运行，然后寻找网络环境更好的时机完成方案 B。
