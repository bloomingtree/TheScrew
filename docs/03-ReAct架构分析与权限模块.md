# 03 - ReAct 架构分析与权限模块

> 创建日期：2026-06-12 | 更新日期：2026-06-13
> 状态：**待确认**
> 更新：新增工具执行次数限制、多 Agent 协作架构

## 1. ReAct 架构分析

### 1.1 什么是 ReAct？

ReAct（Reasoning + Acting）是一种让 LLM Agent 交替进行**推理（Thought）**和**行动（Action）**的模式：

```
Thought: 用户想知道3号服务器的状态，我需要先查找服务器配置...
Action: ssh(host="192.168.1.103", command="systemctl status nginx")
Observation: nginx.service is running (PID 1234)...
Thought: Nginx 正常运行，我再检查一下系统负载...
Action: ssh(host="192.168.1.103", command="uptime")
Observation: load average: 0.52, 0.48, 0.45
Thought: 一切正常，可以回复用户了。
Answer: 3号服务器状态正常...
```

### 1.2 当前架构的 ReAct 分析

**当前实现**（`electron/main/ipc/chat.ts`）：

```
┌──────────────────────────────────────────┐
│              while (true)                 │
│  ┌──────────────────────────────────┐    │
│  │  1. 发送消息给 LLM（含工具定义）    │    │
│  │  2. LLM 返回文本 + tool_calls      │    │
│  │  3. 如果有 tool_calls：             │    │
│  │     → 执行工具                     │    │
│  │     → 将结果加入消息                │    │
│  │     → 继续循环                     │    │
│  │  4. 如果没有 tool_calls：           │    │
│  │     → 结束循环                     │    │
│  └──────────────────────────────────┘    │
└──────────────────────────────────────────┘
```

**对比 ReAct 模式**：

| 特征 | 标准 ReAct | 当前实现 | 差距 |
|------|-----------|----------|------|
| Thought 步骤 | 显式推理过程 | 隐式（LLM 内部推理） | ✅ 已通过 thinking 模式支持 |
| Action 步骤 | 工具调用 | tool_calls | ✅ 已实现 |
| Observation | 工具返回结果 | 工具 handler 返回值 | ✅ 已实现 |
| 循环推理 | 多轮 Thought-Action-Observation | while(true) 循环 | ✅ 已实现 |
| 无硬性迭代上限 | 持续到任务完成 | 无上限（每10轮提醒） | ✅ 已实现 |
| 并行工具调用 | 可选 | Promise.allSettled | ✅ 已实现 |
| 中间推理可见 | 展示思考过程 | thinking content 支持 | ✅ 已实现 |

### 1.3 结论

**当前架构已经基本符合 ReAct 模式**。核心循环就是 Thought(Action(Observation)) 的迭代：

1. LLM 接收上下文 → **推理（Thought）**：分析需要什么工具
2. LLM 生成 tool_calls → **行动（Action）**：调用工具
3. 工具返回结果 → **观察（Observation）**：将结果反馈给 LLM
4. 重复直到 LLM 不再调用工具 → **最终回答（Answer）**

与 DeerFlow（字节的 Agent 框架）的差异主要在**工程细节**而非架构范式：

| 特征 | DeerFlow | 当前实现 | 改进建议 |
|------|----------|----------|----------|
| 多 Agent 协作 | Supervisor + 子Agent | 仅有 SubagentManager（基础） | 需增强 → 详见 05 文档 |
| 工作流定义 | 支持预定义工作流 | 无 | 按需添加 |
| 状态机管理 | 明确的状态转换 | 隐式（循环条件） | 可选优化 |
| 工具结果缓存 | 支持 | 不支持 | 可添加 |
| 错误恢复 | 有重试和回退 | 简单重试 | 可优化 |
| 工具次数限制 | 有 | 无（无限循环） | **需添加** |

### 1.4 建议的增强

当前架构已经足够支撑运维场景，以下为**可选增强**：

#### 增强 1：显式 Thought 输出

```typescript
// 在系统提示中引导 LLM 先输出思考过程
const REACT_PROMPT = `
在调用工具之前，先用 <thought> 标签说明你的推理过程：
<thought>
用户报告3号服务器掉线。我需要：
1. 先检查服务器是否可达 (ping)
2. 如果可达，检查服务状态
3. 查阅运维手册中的故障处理章节
</thought>
`;
```

#### 增强 2：工具调用策略

```typescript
interface ToolCallStrategy {
  /** 最大并行调用数 */
  maxParallel: number;
  /** 单次工具超时 */
  toolTimeout: number;
  /** 失败重试次数 */
  retryCount: number;
  /** 是否允许跳过失败工具继续执行 */
  continueOnError: boolean;
}
```

#### 增强 3：执行计划预览（Planner）

对于复杂任务，LLM 先生成执行计划，用户确认后再逐步执行：

```
📋 执行计划：
1. [只读] 检查服务器连通性 → ping
2. [只读] 检查服务状态 → ssh + systemctl status
3. [只读] 查看错误日志 → ssh + tail /var/log/...
4. [修改] 重启服务 → ssh + systemctl restart（需确认）

确认执行此计划？[全部执行 / 选择执行 / 取消]
```

## 2. 权限模块设计

### 2.1 当前权限现状

| 组件 | 状态 | 说明 |
|------|------|------|
| Agent 配置 `tools.allow/deny` | ❌ 未运行时执行 | 仅文档描述，ToolManager 不检查 |
| CommandValidator | ✅ 已实现 | bash 工具的危险命令检测 |
| Electron 安全 | ✅ 已实现 | contextIsolation + nodeIntegration: false |
| 远程操作权限 | ❌ 不存在 | 无 SSH/WinRM 权限控制 |

### 2.2 权限模型设计

```
┌─────────────────────────────────────────────┐
│              PermissionManager                │
├─────────────────────────────────────────────┤
│                                              │
│  ┌─────────────┐    ┌──────────────┐        │
│  │  Tool Policy │    │  Auth Policy  │        │
│  │  (工具权限)   │    │  (认证策略)   │        │
│  └──────┬──────┘    └──────┬───────┘        │
│         │                   │                │
│  ┌──────┴──────┐    ┌──────┴───────┐        │
│  │ Risk Level  │    │ Confirmation  │        │
│  │ (风险等级)   │    │ (确认机制)    │        │
│  └─────────────┘    └──────────────┘        │
│                                              │
│  ┌─────────────────────────────────────┐    │
│  │          Audit Log (审计日志)         │    │
│  └─────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
```

### 2.3 工具风险分级

```typescript
enum ToolRiskLevel {
  SAFE = 'safe',           // 无风险，自动执行
  LOW = 'low',             // 低风险，可自动执行但记录日志
  MEDIUM = 'medium',       // 中风险，需要用户确认（可设置免确认）
  HIGH = 'high',           // 高风险，每次必须确认
  CRITICAL = 'critical',   // 极高风险，需二次确认 + 操作理由
}

const TOOL_RISK_LEVELS: Record<string, ToolRiskLevel> = {
  // 文件工具
  'get_workspace': ToolRiskLevel.SAFE,
  'list_directory': ToolRiskLevel.SAFE,
  'read_file': ToolRiskLevel.SAFE,
  'get_file_info': ToolRiskLevel.SAFE,
  'edit_file': ToolRiskLevel.MEDIUM,
  'write_file': ToolRiskLevel.MEDIUM,

  // 搜索工具
  'grep': ToolRiskLevel.SAFE,
  'glob': ToolRiskLevel.SAFE,
  'search_content': ToolRiskLevel.SAFE,

  // Bash 工具
  'bash': ToolRiskLevel.MEDIUM, // 实际风险由 CommandValidator 动态判断

  // 远程工具
  'ssh': ToolRiskLevel.MEDIUM,
  'winrm': ToolRiskLevel.MEDIUM,
  'ssh_upload': ToolRiskLevel.HIGH,
  'deploy': ToolRiskLevel.HIGH,

  // Office 工具
  'word_create': ToolRiskLevel.LOW,
  'word_edit': ToolRiskLevel.LOW,
};
```

### 2.4 确认机制

```typescript
interface ConfirmationRequest {
  /** 请求 ID */
  id: string;
  /** 工具名 */
  tool: string;
  /** 操作描述（人类可读） */
  description: string;
  /** 风险等级 */
  riskLevel: ToolRiskLevel;
  /** 具体参数（供用户审阅） */
  params: Record<string, any>;
  /** 超时时间（秒），超时自动拒绝 */
  timeout: number;
  /** 是否允许"本会话不再询问" */
  allowSkipFor: boolean;
}

interface ConfirmationResponse {
  approved: boolean;
  /** 如果 approved=true 且 allowSkipFor=true，可设置本次会话免确认 */
  skipForSession?: boolean;
  /** 用户备注 */
  note?: string;
}
```

### 2.5 权限配置文件

```json
// .config/data/permissions.json
{
  "policies": {
    "default": {
      "autoApprove": ["safe", "low"],
      "requireConfirmation": ["medium", "high"],
      "deny": ["critical"],
      "sessionOverrides": []
    },
    "devops": {
      "autoApprove": ["safe", "low"],
      "requireConfirmation": ["medium"],
      "deny": [],
      "sessionOverrides": [
        {
          "tool": "ssh",
          "host": "192.168.1.103",
          "approvedUntil": "2026-06-12T18:00:00"
        }
      ],
      "sshHostApprovals": {
        "192.168.1.101": { "autoApprove": ["read_only"], "expires": "2026-06-12T18:00:00" },
        "192.168.1.103": { "autoApprove": ["read_only", "service_restart"], "expires": "2026-06-12T18:00:00" }
      }
    }
  },
  "commandBlacklist": [
    "rm -rf /",
    "format C:",
    "dd if="
  ],
  "commandWhitelist": {
    "ssh": [
      "ping *",
      "systemctl status *",
      "docker ps",
      "df -h",
      "free -m",
      "uptime",
      "tail *"
    ]
  }
}
```

### 2.6 前端确认界面

当工具需要确认时：

```
┌─────────────────────────────────────────────┐
│ ⚠️ 操作确认                                  │
├─────────────────────────────────────────────┤
│                                              │
│  工具：ssh                                    │
│  目标：web-01 (192.168.1.101)                 │
│  命令：systemctl restart nginx               │
│                                              │
│  风险等级：🔴 高                               │
│  说明：重启 Nginx 服务会导致短暂不可用          │
│                                              │
│  ┌─────────┐ ┌─────────┐ ┌──────────────┐   │
│  │  ✅ 确认  │ │  ❌ 拒绝  │ │ 🔒 本次免确认 │   │
│  └─────────┘ └─────────┘ └──────────────┘   │
│                                              │
│  💡 该操作将被记录在审计日志中                  │
└─────────────────────────────────────────────┘
```

### 2.7 审计日志

```typescript
interface AuditLogEntry {
  timestamp: string;
  tool: string;
  action: string;        // "execute" | "approved" | "denied" | "auto-approved"
  params: Record<string, any>;
  riskLevel: ToolRiskLevel;
  result?: 'success' | 'failure' | 'timeout';
  userId?: string;       // 如果有多用户
  sessionId: string;
  userNote?: string;     // 用户确认时的备注
}
```

日志存储在 `.config/data/audit-*.log` 中，按日期滚动。

## 3. 与现有系统的集成点

### 3.1 在 ToolManager 中集成

```typescript
// electron/main/tools/ToolManager.ts 修改点

class ToolManager {
  private permissionManager: PermissionManager;

  async executeToolCall(toolCall: any): Promise<any> {
    const tool = this.tools.get(toolCall.function.name);

    // 1. 检查工具是否存在
    if (!tool) throw new Error(`Tool not found: ${toolCall.function.name}`);

    // 2. 【新增】权限检查
    const permission = await this.permissionManager.checkPermission(
      tool.name, args, this.currentAgent
    );

    if (permission === 'denied') {
      return { error: '该操作被权限策略拒绝' };
    }

    if (permission === 'requires_confirmation') {
      // 3. 【新增】发送确认请求到前端
      const confirmed = await this.requestConfirmation(tool.name, args);
      if (!confirmed) {
        return { error: '用户拒绝了该操作' };
      }
    }

    // 4. 原有执行逻辑
    const result = await tool.handler(args);

    // 5. 【新增】审计日志
    this.permissionManager.logAction(tool.name, args, result);

    return result;
  }
}
```

### 3.2 IPC 通信

```typescript
// 新增 IPC 通道
ipcMain.handle('permission:check', handlePermissionCheck);
ipcMain.handle('permission:respond', handlePermissionResponse);
ipcMain.handle('permission:getPolicies', handleGetPolicies);
ipcMain.handle('permission:updatePolicy', handleUpdatePolicy);
```

## 4. 工具执行次数限制

### 4.1 问题

当前主聊天循环（`electron/main/ipc/chat.ts`）是 `while(true)` 无限制循环：
- `totalToolCalls` 仅用于日志
- `toolCallHistory` 仅在每3次重复时打 warning
- **没有自动中断机制**，可能导致无限循环

对比 SubagentManager 已有 5 次迭代上限。

### 4.2 方案

```typescript
// chat.ts 新增
const MAX_TOTAL_TOOL_CALLS = 50;    // 总工具调用上限（可配置）
const MAX_SINGLE_TOOL_CALLS = 10;   // 单工具调用上限（可配置）
const toolCallCounter = new Map<string, number>();
let totalToolCalls = 0;

while (true) {
  // ... 现有逻辑 ...

  if (hasToolCalls) {
    for (const call of toolCalls) {
      totalToolCalls++;

      // 总次数检查
      if (totalToolCalls >= MAX_TOTAL_TOOL_CALLS) {
        messages.push({
          role: 'system',
          content: `工具调用总次数已达上限（${MAX_TOTAL_TOOL_CALLS}次），请立即总结当前结果并回复用户。`
        });
        // 继续最后一轮让 LLM 总结，不再执行工具
        break;
      }

      // 单工具次数检查
      const toolCount = (toolCallCounter.get(call.name) || 0) + 1;
      toolCallCounter.set(call.name, toolCount);
      if (toolCount >= MAX_SINGLE_TOOL_CALLS) {
        messages.push({
          role: 'system',
          content: `警告：工具 "${call.name}" 已调用 ${toolCount} 次，请检查是否有更高效的方式或直接总结。`
        });
      }
    }
  }
}
```

### 4.3 配置化

```json
// .config/config.json
{
  "permissions": {
    "maxTotalToolCalls": 50,
    "maxSingleToolCalls": 10
  }
}
```

### 4.4 前端展示

当接近限制时，在工具调用区域显示计数：
```
🔧 已使用 38/50 次工具调用 | ssh 已调用 7/10 次
```

## 5. 实施优先级

```
P0 - 基础权限（2-3天）
  ├── ToolRiskLevel 定义
  ├── PermissionManager 核心逻辑
  ├── 前端确认弹窗
  └── Agent tools.allow/deny 运行时执行

P1 - 远程操作权限（2-3天）
  ├── SSH 命令风险分析
  ├── 白名单/黑名单机制
  ├── 会话级免确认
  └── 审计日志

P2 - 高级权限（按需）
  ├── 基于时间的权限过期
  ├── 多级审批
  ├── RBAC（如果有多用户）
  └── 权限策略导入/导出
```
