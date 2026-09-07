# 零员工 (Zero Employee) - AI 智能助手

> 一款基于 Electron 的 AI Agent 桌面应用，AI 助手名为"螺丝钉"

---

## 一、产品定位

**零员工**是一款运行在内网环境的智能助手软件。核心理念是：每台电脑上都有一个智能体，帮助用户完成日常办公任务。

**目标用户**：内网环境下的企业员工

**核心价值**：
- 离线可用，不依赖外网
- 文档处理（Word、Excel）
- 任务自动化
- 技能扩展

---

## 二、核心功能

### 2.1 对话系统

- **流式对话**：与 AI 进行自然语言交互
- **多模型支持**：支持 OpenAI、Claude、通义千问等多种模型
- **工具调用**：AI 可以调用工具执行任务
- **对话历史**：自动保存对话记录，支持搜索和恢复

### 2.2 文件处理

| 文件类型 | 预览 | 编辑 | 说明 |
|---------|------|------|------|
| Word (.docx) | ✅ | ✅ | 段落编辑、目录导航 |
| Excel (.xlsx/.xls) | ✅ | ⚪ | 多工作表预览 |
| 文本/代码 | ✅ | ✅ | 语法高亮、搜索 |
| 图片 | ✅ | - | 缩放、旋转 |
| PPT (.pptx) | ✅ | - | 缩略图预览 |

### 2.3 技能系统

**技能 = 纯 Markdown 文档**（SKILL.md）

```
.config/skills/
├── docx/           # Word 文档处理
│   └── SKILL.md
└── xlsx/           # Excel 处理
    └── SKILL.md
```

**特点**：
- 即插即用：放入 .md 文件即可
- 按需加载：AI 识别关键词后自动加载相关技能
- 支持导入/导出：zip 格式分享

### 2.4 工具系统

AI 可以调用的工具：

| 工具 | 功能 |
|------|------|
| `bash` | 执行命令（支持内置 Python 3.8.10） |
| `read` | 读取文件 |
| `write` | 写入文件 |
| `edit` | 编辑文件（字符串替换） |
| `ls` | 列出目录内容 |
| `get_file_info` | 获取文件信息 |
| `cron_add/list` | 定时任务管理 |

### 2.5 记忆系统

- **长期记忆**：持久化的笔记
- **每日笔记**：当天的工作记录
- **自动注入**：记忆内容会注入到 AI 的系统提示词中

### 2.6 定时任务

- **Cron 任务**：定时执行任务
- **心跳任务**：周期性任务（通过 HEARTBEAT.md 配置）

---

## 三、技术架构

### 3.1 技术栈

- **运行时**：Electron 22 + Node.js + TypeScript
- **前端**：React + Zustand + TailwindCSS
- **数据存储**：electron-store（JSON 文件）
- **内置 Python**：3.8.10 嵌入版

### 3.2 目录结构

```
zero-employee/
├── electron/               # Electron 主进程
│   ├── main/
│   │   ├── api/           # OpenAI API 客户端
│   │   ├── config/        # 配置管理（PathManager、AppConfigStore）
│   │   ├── core/          # 核心模块（SkillManager、ContextBuilder）
│   │   ├── db/            # 数据存储
│   │   ├── ipc/           # IPC 处理器
│   │   ├── p2p/           # P2P 通信（预留）
│   │   ├── processors/    # 内容提取器
│   │   └── tools/         # 工具实现
│   └── preload/           # 预加载脚本
│
├── src/                    # React 前端
│   ├── components/        # UI 组件
│   ├── store/             # Zustand 状态管理
│   └── utils/             # 工具函数
│
└── .config/                # 配置和数据目录
    ├── config.json        # 应用配置
    ├── IDENTITY.md        # AI 身份定义
    ├── SOUL.md            # AI 性格设定
    ├── USER.md            # 用户偏好
    ├── TOOLS.md           # 工具使用指南
    ├── data/              # 运行时数据
    │   ├── conversations.json
    │   ├── workspaces.json
    │   └── attachments/
    ├── skills/            # 技能目录
    ├── agents/            # Agent 配置
    ├── credentials/       # API 密钥
    └── memory/            # 记忆系统
```

### 3.3 数据流

```
用户输入 → 前端组件 → IPC → 主进程处理 → API 调用 → 流式返回 → 前端渲染
```

---

## 四、核心模块说明

### 4.1 PathManager - 路径管理器

统一管理所有文件路径，支持：
- 开发/生产环境自动适配
- 旧数据自动迁移
- 集中存储在 `.config/` 目录

### 4.2 ContextBuilder - 上下文构建器

构建 AI 的系统提示词，包含：
1. 核心身份（中文）
2. 时间信息
3. 配置文件（IDENTITY.md, SOUL.md 等）
4. 记忆系统
5. 技能摘要
6. 工具定义

### 4.3 SimpleSkillManager - 技能管理器

nanobot 风格的极简设计：
- 技能 = 纯 Markdown 文档
- 支持 YAML frontmatter 元数据
- 支持导入/导出/删除

### 4.4 ToolManager / ToolRegistry

双层工具管理：
- **ToolManager**：传统工具管理，支持工具组
- **ToolRegistry**：nanobot 风格，权限控制

---

## 五、特色功能

### 5.1 多标签页系统

- 支持左右面板分屏
- 文件预览在标签页中打开
- 支持拖拽排序

### 5.2 附件系统

- 拖拽上传文件
- 图片、文档自动提取内容
- 附件与对话关联

### 5.3 P2P 共享（预留）

- 局域网设备发现
- 技能共享
- 当前未启用，待完善

---

## 六、当前状态

### 已实现 ✅
- 对话系统（流式、多模型、工具调用）
- 文件预览（Word、Excel、文本、图片、PPT）
- Word 编辑（段落级别）
- 技能系统（加载、导入、导出）
- 工具调用（bash、文件操作）
- 记忆系统
- 定时任务

### 待完善 ⚪
- Excel 编辑功能
- PPT 编辑功能
- P2P 共享功能

---

## 七、开发指南

### 环境要求

- Node.js: 16.17.1（或兼容 16.x 的版本）
- npm: 8.x 或更高
- Windows 7 SP1 或更高

### 启动开发服务器

```bash
npm install
npm run dev
```

### 构建

```bash
npm run build
npm run package
```

构建后的安装包位于 `release/` 目录。

### 关键配置文件

| 文件 | 用途 |
|------|------|
| `.config/SOUL.md` | AI 性格设定 |
| `.config/IDENTITY.md` | AI 身份定义 |
| `.config/USER.md` | 用户偏好 |
| `.config/config.json` | 模型配置 |

---

## 八、Windows 7 兼容性说明

### 系统要求

- Windows 7 SP1 或更高版本
- Visual C++ 2015-2022 Redistributable（必需）

### 安装 Visual C++ Redistributable

如果应用无法启动，请先安装 Visual C++ Redistributable：

下载地址：https://aka.ms/vs/17/release/vc_redist.x64.exe

---

## 许可证

MIT License

---

*文档更新时间：2026-03-17*
