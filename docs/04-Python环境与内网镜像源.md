# 04 - Python 环境与内网镜像源

> 创建日期：2026-06-12 | 更新日期：2026-06-13
> 状态：**待确认**
> 更新：确认内网镜像为 nginx 搭建，需补充 Python 3.8 兼容包（paramiko 等）

## 1. 背景

### 现状

项目已内嵌 Python 3.8.10 嵌入式发行版：

```
electron/main/python/python-3.8.10-embed-amd64/
├── python.exe
├── python38.dll
├── Lib/
│   └── site-packages/
│       ├── pandas/       (2.0.3)
│       ├── numpy/        (1.24.4)
│       ├── openpyxl/     (3.1.5)
│       ├── python-docx/
│       ├── pypdf/
│       ├── Pillow/
│       └── pip/          (25.0.1)
└── ...
```

### 需求

1. 支持**配置内网 PyPI 镜像源**，当需要额外依赖时可从内网下载
2. 在执行 Python 脚本前自动安装缺失的依赖
3. 运维场景可能需要额外库：`paramiko`（SSH）、`pywinrm`（WinRM）等
4. **内网镜像已有**：用户通过 nginx 搭建，需要补充 Python 3.8 兼容的运维相关包

## 2. 内网镜像源配置

### 2.1 配置方式

在 `.config/config.json` 中新增：

```json
{
  "python": {
    "enabled": true,
    "mirrorUrl": "http://192.168.1.100:8080/simple/",
    "trustedHost": "192.168.1.100",
    "timeout": 120,
    "autoInstall": true,
    "maxPackageSize": "500MB",
    "preInstalled": [
      "pandas",
      "numpy",
      "openpyxl",
      "python-docx",
      "pypdf",
      "Pillow"
    ],
    "extraRequirements": [
      "paramiko>=2.12.0"
    ]
  }
}
```

### 2.2 pip 配置文件

自动生成 `pip.ini`（Windows）或 `pip.conf`（Linux）：

```ini
[global]
index-url = http://192.168.1.100:8080/simple/
trusted-host = 192.168.1.100
timeout = 120
```

路径：`electron/main/python/python-3.8.10-embed-amd64/pip.ini`

### 2.3 镜像源管理工具

```typescript
// electron/main/tools/PythonTools.ts 新增

interface PythonConfig {
  mirrorUrl: string;
  trustedHost: string;
  timeout: number;
  autoInstall: boolean;
  extraRequirements: string[];
}

class PythonPackageManager {
  private pythonPath: string;
  private config: PythonConfig;

  /** 更新 pip 配置 */
  async updatePipConfig(): Promise<void> {
    const pipConfPath = path.join(path.dirname(this.pythonPath), 'pip.ini');
    const content = `[global]
index-url = ${this.config.mirrorUrl}
trusted-host = ${this.config.trustedHost}
timeout = ${this.config.timeout}`;
    await writeFile(pipConfPath, content);
  }

  /** 安装包 */
  async installPackage(packageName: string): Promise<InstallResult> {
    const cmd = `"${this.pythonPath}" -m pip install "${packageName}"`;
    const { stdout, stderr } = await exec(cmd, { timeout: this.config.timeout * 1000 });
    return { success: true, output: stdout };
  }

  /** 批量安装依赖 */
  async installRequirements(requirements: string[]): Promise<InstallResult[]> {
    return Promise.all(requirements.map(pkg => this.installPackage(pkg)));
  }

  /** 检查包是否已安装 */
  async isPackageInstalled(packageName: string): Promise<boolean> {
    try {
      await exec(`"${this.pythonPath}" -c "import ${packageName}"`);
      return true;
    } catch {
      return false;
    }
  }

  /** 自动安装缺失依赖并执行脚本 */
  async runScript(scriptPath: string, args: string[]): Promise<ScriptResult> {
    // 1. 解析脚本中的 import 语句
    const imports = await this.parseImports(scriptPath);

    // 2. 检查缺失的包
    const missing = [];
    for (const imp of imports) {
      if (!await this.isPackageInstalled(imp)) {
        missing.push(imp);
      }
    }

    // 3. 安装缺失的包
    if (missing.length > 0 && this.config.autoInstall) {
      await this.installRequirements(missing);
    }

    // 4. 执行脚本
    return this.executeScript(scriptPath, args);
  }
}
```

### 2.4 内网 PyPI 镜像搭建指南

#### 方案 A：devpi（推荐）

```bash
# 在内网服务器上
pip install devpi-server devpi-web

# 初始化
devpi-init

# 启动
devpi-server --host 0.0.0.0 --port 8080

# 从公网同步常用包
devpi use http://localhost:8080/root/pypi
devpi push paramiko root/pypi
```

#### 方案 B：pypiserver（轻量）

```bash
pip install pypiserver passlib

# 创建包目录
mkdir -p /data/pypi-packages

# 下载常用包
pip download -d /data/pypi-packages paramiko pywinrm

# 启动
pypi-server run -p 8080 /data/pypi-packages
```

#### 方案 C：nginx + 本地目录（最简单）

```bash
# 目录结构
/data/pypi/
├── simple/
│   ├── paramiko/
│   │   └── paramiko-2.12.0.tar.gz
│   ├── pywinrm/
│   │   └── pywinrm-0.4.3.tar.gz
│   └── index.html

# nginx 配置
server {
    listen 8080;
    location /simple/ {
        root /data/pypi;
        autoindex on;
    }
}
```

## 3. Python 执行工具增强

### 3.1 专用 Python 工具（可选）

当前 Python 通过 bash 工具执行。可以新增专用工具以提供更好的体验：

```typescript
{
  name: 'python',
  description: '执行 Python 代码或脚本',
  parameters: {
    type: 'object',
    properties: {
      code: { type: 'string', description: 'Python 代码（单行或代码块）' },
      file: { type: 'string', description: 'Python 脚本文件路径' },
      args: { type: 'array', items: { type: 'string' }, description: '脚本参数' },
      autoInstall: { type: 'boolean', description: '自动安装缺失依赖' },
      timeout: { type: 'number', description: '超时(ms)，默认 60000' },
    },
  },
}
```

### 3.2 运维常用 Python 依赖

```txt
# electron/main/runtime/requirements-ops.txt
paramiko>=2.12.0       # SSH 连接
bcrypt>=4.0.1          # paramiko 依赖
cryptography>=41.0.7   # paramiko 依赖
pynacl>=1.5.0          # paramiko 依赖
pywinrm>=0.4.3         # Windows 远程管理（WinRM，用于 Win2012）
requests_ntlm>=1.2.0   # pywinrm NTLM 依赖
requests>=2.31.0       # HTTP 请求
psutil>=5.9.0          # 系统监控
```

### 3.3 内网镜像补充包（下载脚本）

在公网机器上执行，下载 Python 3.8 + win_amd64 兼容包：

```bash
#!/bin/bash
# download-pkgs.sh
DEST="/data/pypi-packages"
mkdir -p "$DEST"

# 下载 wheel 包（指定 Python 3.8 + Windows AMD64）
pip download -d "$DEST" \
  paramiko==2.12.0 \
  bcrypt==4.0.1 \
  cryptography==41.0.7 \
  pynacl==1.5.0 \
  requests==2.31.0 \
  --python-version 38 \
  --platform win_amd64 \
  --only-binary=:all:

# pywinrm 可能没有对应 wheel，下载源码
pip download -d "$DEST" \
  pywinrm==0.4.3 \
  requests_ntlm==1.2.0 \
  --no-deps

# 将下载的文件按包名组织到 nginx 镜像目录
# 目录结构：
# /data/pypi/simple/
# ├── paramiko/
# │   ├── paramiko-2.12.0-py3-none-any.whl
# │   └── index.html
# ├── bcrypt/
# │   └── ...
```

然后放入 nginx 镜像目录，确保 `index.html` 列出所有文件。

## 4. 实施优先级

```
P0 - 镜像源配置（1天）
  ├── config.json 配置项
  ├── pip.ini 自动生成
  └── PackageManager 基础实现

P1 - 自动依赖管理（1-2天）
  ├── import 解析
  ├── 自动安装
  └── 安装日志

P2 - 运维依赖预装（1天）
  ├── paramiko 安装验证
  ├── pywinrm 安装验证（如需）
  └── requirements-ops.txt
```
