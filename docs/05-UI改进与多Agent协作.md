# 05 - UI 改进与多 Agent 协作

> 创建日期：2026-06-13
> 状态：草案

## 1. 工具调用状态 UI 改进

### 1.1 问题分析

当前工具调用在 UI 中的展示存在以下问题：

| 问题 | 现状 | 影响 |
|------|------|------|
| 编写阶段无反馈 | LLM 生成 tool_call 参数时 UI 卡住 | 用户以为程序无响应 |
| status prop 未使用 | `ToolCallSimple` 接收 `status` 但不使用 | 状态显示不准确 |
| toolExecutions 死代码 | store 中 `toolExecutions` Map 被填充但无组件读取 | 浪费资源 |
| 流式 delta 未处理 | `chat:chunk` 事件中已有 tool_call delta 但前端未解析 | 缺少中间状态 |

### 1.2 流式解析中的 tool_call 检测

当前后端 `chat.ts` 在解析 SSE 流时，`tool_calls` 是累积完整的（通过 index-based accumulation），完成后一次性发送 `chat:tool_calls` 事件。在这之前，前端没有收到任何关于正在编写工具调用的信息。

**改进方案**：新增 `chat:tool_call_writing` 事件

```
时间线：
  ┌────────────────────────────────────────────────────────┐
  │ LLM 输出                                                │
  │                                                         │
  │ [text] "让我检查一下..."                                 │
  │ [thinking] "用户需要检查服务器，我应该调用ssh工具..."      │
  │ [tool_call delta] function.name = "ssh"                 │
  │ [tool_call delta] arguments.part1 = '{"host": "1'      │
  │ [tool_call delta] arguments.part2 = '92.168.1.101"'    │
  │ [tool_call delta] arguments.part3 = ', "command": "u'  │
  │ ...                                                     │
  │ [tool_call complete] 完整的 tool_call 对象               │
  └────────────────────────────────────────────────────────┘

  前端事件：
  chat:chunk(text)           → 显示文字
  chat:chunk(thinking)       → 更新思考组件
  chat:tool_call_writing     → 显示工具调用框 + "正在编写..." ← 新增
  chat:tool_calls            → 工具参数完成，切换状态
  chat:tool_start            → 开始执行
  chat:tool_complete         → 执行完成
  chat:tool_results          → 结果返回
```

### 1.3 后端修改（chat.ts）

```typescript
// 在 tool_call delta 解析循环中
if (delta.tool_calls) {
  for (const tcDelta of delta.tool_calls) {
    const idx = tcDelta.index ?? 0;

    // 累积 tool_call（现有逻辑）
    // ...

    // 【新增】首次检测到 tool_call delta 时通知前端
    if (tcDelta.function?.name && !toolCallNotified[idx]) {
      toolCallNotified[idx] = true;
      event.sender.send('chat:tool_call_writing', {
        toolCallId: toolCalls[idx].id,
        name: tcDelta.function.name,
        status: 'writing',   // 正在编写参数
        timestamp: Date.now(),
      });
    }

    // 【新增】参数编写中，更新进度
    if (tcDelta.function?.arguments) {
      event.sender.send('chat:tool_call_writing', {
        toolCallId: toolCalls[idx].id,
        status: 'writing',
        argLength: (toolCalls[idx].function.arguments || '').length,
      });
    }
  }
}
```

### 1.4 前端修改

#### InputArea.tsx 新增事件监听

```typescript
// 新增 handler
const handleToolCallWriting = (_event: any, data: ToolCallWritingData) => {
  setToolCallWriting(data);
};
```

#### chatStore.ts 新增状态

```typescript
interface ToolCallWritingData {
  toolCallId: string;
  name: string;
  status: 'writing' | 'written';
  argLength?: number;
  timestamp: number;
}

// 新增 store 字段
toolCallWritingMap: Map<string, ToolCallWritingData>;

// Actions
setToolCallWriting: (data: ToolCallWritingData) => {
  set(state => {
    const map = new Map(state.toolCallWritingMap);
    map.set(data.toolCallId, data);
    return { toolCallWritingMap: map };
  });
},

clearToolCallWriting: (toolCallId: string) => {
  set(state => {
    const map = new Map(state.toolCallWritingMap);
    map.delete(toolCallId);
    return { toolCallWritingMap: map };
  });
},
```

#### ToolCallSimple.tsx 状态展示

```
┌────────────────────────────────────────────────┐
│ 🔧 ssh                          ● 正在编写...  │  ← writing 状态
│    目标：192.168.1.101                          │
└────────────────────────────────────────────────┘

┌────────────────────────────────────────────────┐
│ 🔧 ssh                          ⟳ 正在执行...  │  ← executing 状态
│    host: 192.168.1.101                          │
│    command: systemctl status nginx              │
└────────────────────────────────────────────────┘

┌────────────────────────────────────────────────┐
│ 🔧 ssh                          ✅ 已完成 (2s)  │  ← completed 状态
│    host: 192.168.1.101                          │
│    ┌─────────────────────────────────┐         │
│    │ nginx.service - running (PID)    │         │
│    └─────────────────────────────────┘         │
└────────────────────────────────────────────────┘
```

**措辞方案**：

| 状态 | 中文标签 | 英文标签 | 图标 |
|------|----------|----------|------|
| writing | **正在编写** | Writing... | `✏️` 或闪烁光标 |
| written | 参数就绪 | Ready | `📋` |
| executing | **正在执行** | Running... | `⟳` 旋转 |
| completed | **已完成** | Done | `✅` |
| error | **执行失败** | Failed | `❌` |
| timeout | **执行超时** | Timeout | `⏱️` |

### 1.5 状态流转

```typescript
// ToolCallSimple.tsx 中的状态判定逻辑（重构）
const getToolCallStatus = (): ToolCallStatus => {
  const writingData = toolCallWritingMap?.get(toolCall.id);
  const result = toolResults?.find(r => r.toolCallId === toolCall.id);

  // 优先级：result > writing > default
  if (result) {
    if (!result.success) return 'error';
    return 'completed';
  }

  if (writingData) {
    return writingData.status === 'writing' ? 'writing' : 'written';
  }

  // fallback：有 tool_calls 但没 result 也没 writing
  return 'executing';
};
```

## 2. Think 内容归位修复

### 2.1 问题

当模型在调用工具前输出 thinking 内容时：
1. `\x01THINKING\x02` 前缀的内容被 `accumulatedThinking` 捕获
2. `updateLastMessageThinking()` 被调用，存入消息的 `thinkingContent`
3. 但 `AssistantMessage` 组件在渲染时，如果消息包含 `tool_calls`，可能跳过 thinking 的显示

### 2.2 修复方案

```typescript
// src/components/Chat/messages/AssistantMessage.tsx
// 确保在渲染 tool_calls 的同时也渲染 thinkingContent

// 当前逻辑（伪代码）：
// if (toolCalls) { renderToolCalls(); }
// if (thinkingContent) { renderThinking(); }

// 修复后：
// 无论是 tool_calls 还是普通内容，都先检查并渲染 thinkingContent
const thinkingBlock = message.thinkingContent || extractThinkingFromContent(message.content).thinking;
if (thinkingBlock) {
  // 始终渲染思考组件
  renderThinkingBlock(thinkingBlock);
}

if (message.tool_calls?.length) {
  renderToolCalls(message.tool_calls);
} else {
  renderContent(displayContent);
}
```

## 3. 多 Agent 协作（Supervisor 模式）

### 3.1 架构设计（借鉴 DeerFlow）

```
┌─────────────────────────────────────────────────┐
│                  用户请求                         │
│                      │                           │
│              ┌───────┴───────┐                   │
│              │  Supervisor   │                    │
│              │  (主 Agent)   │                    │
│              └───────┬───────┘                   │
│                      │                           │
│         ┌────────────┼────────────┐              │
│         │            │            │              │
│    ┌────┴────┐  ┌────┴────┐  ┌───┴──────┐      │
│    │ devops  │  │ default │  │  office   │      │
│    │ 子Agent │  │ 子Agent │  │  子Agent  │      │
│    └────┬────┘  └────┬────┘  └────┬─────┘      │
│         │            │            │              │
│         │   各自独立的上下文窗口     │              │
│         │   各自独立的工具集       │              │
│         │   各自独立的终止条件     │              │
│         │            │            │              │
│         └────────────┼────────────┘              │
│                      │                           │
│              ┌───────┴───────┐                   │
│              │  结果综合      │                    │
│              │  Supervisor   │                    │
│              └───────┬───────┘                   │
│                      │                           │
│                  最终回复                         │
└─────────────────────────────────────────────────┘
```

### 3.2 与现有 SubagentManager 的增强

当前 `SubagentManager`（`electron/main/subagents/SubagentManager.ts`）的能力：

| 能力 | 现状 | 增强方向 |
|------|------|----------|
| 子任务创建 | ✅ `createTask()` | 支持 agentType 参数 |
| 系统提示 | ✅ 可自定义 | 自动注入角色提示 |
| 工具限制 | ❌ 无 | 新增 allowedTools 参数 |
| 结果获取 | ✅ Promise 返回 | 支持流式回调 |
| 迭代上限 | ✅ 默认 5 次 | 保持，可配置 |
| 上下文隔离 | ⚠️ 共享 workspace path | 完全隔离 |
| 并行执行 | ❌ 串行 | Promise.all 并行 |

### 3.3 增强后的接口

```typescript
interface SubAgentTask {
  /** 使用的 Agent 类型 */
  agentType: 'default' | 'devops' | 'office' | 'secretary';
  /** 任务描述 */
  task: string;
  /** 允许使用的工具列表 */
  allowedTools?: string[];
  /** 自定义系统提示补充 */
  systemPromptAddon?: string;
  /** 最大迭代次数 */
  maxIterations?: number;
  /** 输入数据（从其他子 Agent 传递） */
  input?: any;
}

interface SubAgentResult {
  /** 任务 ID */
  taskId: string;
  /** 执行状态 */
  status: 'completed' | 'failed' | 'timeout';
  /** 输出内容 */
  content: string;
  /** 工具调用记录 */
  toolCalls?: any[];
  /** 输出数据（传递给其他子 Agent） */
  output?: any;
}
```

### 3.4 Supervisor 调度逻辑

```typescript
class AgentSupervisor {
  /**
   * 执行多 Agent 任务
   */
  async executePlan(
    userRequest: string,
    plan: ExecutionPlan,
    onProgress: (update: ProgressUpdate) => void
  ): Promise<SupervisorResult> {

    // 1. 分析任务，生成子任务列表
    const subTasks = plan.tasks;

    // 2. 按依赖关系排序（无依赖的并行执行）
    const { parallel, sequential } = this.analyzeDependencies(subTasks);

    // 3. 并行执行无依赖的任务
    const parallelResults = await Promise.all(
      parallel.map(task => this.runSubAgent(task, onProgress))
    );

    // 4. 顺序执行有依赖的任务
    const sequentialResults = [];
    for (const task of sequential) {
      // 注入前置任务的输出作为输入
      task.input = this.collectResults(parallelResults, sequentialResults);
      const result = await this.runSubAgent(task, onProgress);
      sequentialResults.push(result);
    }

    // 5. 综合所有结果
    return this.synthesize(userRequest, [...parallelResults, ...sequentialResults]);
  }

  private async runSubAgent(
    task: SubAgentTask,
    onProgress: (update: ProgressUpdate) => void
  ): Promise<SubAgentResult> {
    // 调用增强后的 SubagentManager
    // 注入角色系统提示 + 工具限制
    // 流式返回进度
    return this.subagentManager.run({
      agentType: task.agentType,
      task: task.task,
      allowedTools: task.allowedTools,
      maxIterations: task.maxIterations || 5,
      onChunk: (chunk) => onProgress({ taskId: task.task, chunk }),
    });
  }
}
```

### 3.5 前端展示

```
┌──────────────────────────────────────────────────┐
│  👤 用户：3号服务器掉线了，帮我排查                  │
│                                                   │
│  🔧 螺丝钉：正在分析任务...                         │
│                                                   │
│  ┌─── 执行计划 ──────────────────────────────┐    │
│  │ ① [devops] SSH 连接检查服务器状态            │    │
│  │ ② [default] 搜索本地运维手册相关章节          │    │
│  │ ③ [综合] 汇总结果并给出处理建议              │    │
│  └───────────────────────────────────────────┘    │
│                                                   │
│  ┌─── 子任务 ① devops ──────────────────────┐    │
│  │ 🔧 ssh → 192.168.1.103                    │    │
│  │ ✅ 连接成功，检查服务状态...                 │    │
│  │ ⟳ 正在执行: systemctl status nginx         │    │
│  └───────────────────────────────────────────┘    │
│                                                   │
│  ┌─── 子任务 ② default ─────────────────────┐    │
│  │ 🔍 grep "服务器掉线" docs/                  │    │
│  │ 📄 read_file("运维手册.docx") → 第5章      │    │
│  │ 📎 引用图片: img_001 (故障排查流程图)       │    │
│  └───────────────────────────────────────────┘    │
│                                                   │
│  ┌─── 综合分析 ─────────────────────────────┐    │
│  │  根据检查结果和运维手册，3号服务器...        │    │
│  │                                           │    │
│  │  [📎 图片引用: 故障排查流程图]              │    │
│  │                                           │    │
│  │  建议操作：                                │    │
│  │  1. 重启 Nginx 服务（风险：中）             │    │
│  │  2. 检查日志 /var/log/nginx/error.log     │    │
│  └───────────────────────────────────────────┘    │
└──────────────────────────────────────────────────┘
```

## 4. 实施优先级

```
P0 - UI 修复（必须先做，改善用户体验）
├── 工具调用状态 UI（1天）
├── Think 内容归位（0.5天）
└── 工具次数限制（0.5天）

P1 - 多 Agent 协作
├── SubagentManager 增强（2天）
├── AgentSupervisor 实现（2天）
├── 前端多 Agent 状态展示（1天）
└── 集成测试（1天）
```
