# Claude Code 离线安装准备清单

## 一、在有网电脑上准备

### 1. 基础环境（在离线电脑上需要）
- [ ] Node.js 安装包（推荐 v20+ LTS）
  - Windows: https://nodejs.org/dist/v20.18.2/node-v20.18.2-x64.msi
  - 或当前最新 LTS 版本

### 2. Claude Code 安装包（自动下载）

使用 `prepare-claude-offline.ps1` 脚本自动下载所有依赖

### 3. 下载完成后的文件结构
```
claude-code-offline/
├── nodejs-installer/
│   └── node-v20.18.2-x64.msi          # Node.js 安装包
├── npm-packages/
│   ├── @anthropic-ai+claude-code-*.tgz
│   ├── @anthropic-ai+sdk-*.tgz
│   └── ... (所有依赖 .tgz 文件)
├── install-offline.ps1                 # 离线安装脚本
├── install-offline.sh                  # Linux/Mac 离线安装脚本
└── package-list.json                   # 依赖清单（供参考）
```

## 二、在离线电脑上安装

### 1. 安装 Node.js
```powershell
# 运行 Node.js 安装包
.\node-v20.18.2-x64.msi
```

### 2. 运行离线安装脚本
```powershell
# Windows PowerShell
.\install-offline.ps1

# Linux/Mac
chmod +x install-offline.sh
./install-offline.sh
```

### 3. 验证安装
```powershell
claude --version
```

## 三、配置离线模式

创建配置文件 `C:\Users\你的用户名\.claude\settings.json`:
```json
{
  "autoMemory": true,
  "memoryDirectory": "C:\\Users\\你的用户名\\.claude\\projects"
}
```

---

**注意**: Windows 用户必须使用 PowerShell，CMD 不支持通配符安装
