# 0号员工 - AI Chat Assistant

一个支持 Windows 7 的 AI 聊天桌面应用。

## 功能特性

- ✅ 基础聊天 UI（消息气泡、滚动、复制、删除）
- ✅ 流式响应（打字机效果）
- ✅ 文件/图片支持（拖拽上传、图片预览）
- ✅ 配置管理（API Key、模型选择、参数调整）
- ✅ 对话管理（新建、删除、重命名、历史记录）
- ✅ Markdown 渲染（代码高亮、表格、列表）
- ✅ Windows 7 兼容

## 技术栈

- **Electron**: 22.3.27（最后一个支持 Win7 的版本）
- **React**: 18.2.0
- **TypeScript**: 5.1.x
- **TailwindCSS**: 3.3.0
- **Zustand**: 4.5.0（状态管理）
- **React Markdown**: 9.0.0（Markdown 渲染）

## 开发环境要求

- Node.js: 16.17.1（或兼容 16.x 的版本）
- npm: 8.x 或更高
- Windows 7 SP1 或更高（用于打包和运行）

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 开发模式

```bash
npm run dev
```

### 3. 构建应用

```bash
npm run build
```

构建后的安装包位于 `release/` 目录。

## 配置说明

首次启动应用时，会自动打开配置对话框。需要填写：

1. **API Key**: 你的 OpenAI 兼容 API 密钥
2. **API 地址**: API 服务地址（默认 `https://api.openai.com/v1`）
3. **模型名称**: 使用的模型（默认 `gpt-3.5-turbo`）
4. **温度**: 控制回复的随机性（0-2）
5. **最大 Token 数**: 限制回复长度

## Windows 7 兼容性说明

### 系统要求

- Windows 7 SP1 或更高版本
- Visual C++ 2015-2022 Redistributable（必需）

### 安装 Visual C++ Redistributable

如果应用无法启动，请先安装 Visual C++ Redistributable：

下载地址：https://aka.ms/vs/17/release/vc_redist.x64.exe

## 许可证

MIT License
