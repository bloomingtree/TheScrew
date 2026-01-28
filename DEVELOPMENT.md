# 0号员工 - 开发和使用指南

## 项目状态

✅ 项目结构已完成
✅ 依赖已安装
✅ 开发服务器正在运行

## 当前问题

### 1. 应用图标

需要在 `build/` 目录添加 `icon.ico` 文件。详细说明见 `build/ICON_README.md`。

### 2. 临时解决方案

如果不想立即添加图标，可以注释掉 `electron/main/index.ts` 中的图标配置。

## 如何运行

### 开发模式

应用已在运行：http://localhost:5173/

如需重启：
```bash
npm run dev
```

### 配置说明

首次启动需要配置：
1. **API Key**: OpenAI 兼容的 API 密钥
2. **API 地址**: 例如 `https://api.openai.com/v1`
3. **模型名称**: 例如 `gpt-3.5-turbo`

### 使用本地模型

如果要使用本地模型（如 Ollama）：
1. 确保 Ollama 已运行
2. API 地址填 `http://localhost:11434/v1`
3. 模型名称填 `llama2` 或其他已安装的模型

## 构建打包

### Windows 7 打包

```bash
npm run build
```

打包后的文件在 `release/` 目录。

### 注意事项

1. **Windows 7 系统要求**：
   - Windows 7 SP1 或更高版本
   - Visual C++ 2015-2022 Redistributable

2. **Visual C++ Redistributable**：
   - 下载地址：https://aka.ms/vs/17/release/vc_redist.x64.exe
   - 如果没有安装，应用可能无法启动

## 项目结构

```
zero-employee/
├── electron/              # Electron 主进程
│   ├── main/              # 主进程代码
│   │   ├── index.ts       # 入口文件
│   │   ├── ipc/           # IPC 处理器
│   │   └── api/           # API 客户端
│   └── preload/           # 预加载脚本
├── src/                   # React 渲染进程
│   ├── components/        # UI 组件
│   ├── store/            # Zustand 状态
│   ├── types/            # 类型定义
│   └── styles/           # 样式
├── build/                # 构建资源（图标等）
└── release/              # 打包输出
```

## 功能说明

### 已实现

✅ 聊天 UI（消息气泡、滚动）
✅ 流式响应（打字机效果）
✅ 配置管理（API Key、模型选择）
✅ 对话管理（新建、删除、重命名）
✅ Markdown 渲染（代码高亮）
✅ 图片上传（多模态）

### 待完善

⏳ 对话历史持久化
⏳ 导出对话为文件
⏳ 深色/浅色主题切换
⏳ 快捷键支持
⏳ 搜索对话功能

## 技术支持

如有问题，请检查：
1. Node.js 版本是否为 16.x
2. 依赖是否正确安装
3. API 配置是否正确
4. 网络连接是否正常

## 下一步

1. 添加应用图标
2. 测试所有功能
3. 打包成安装包
4. 在 Windows 7 上测试
