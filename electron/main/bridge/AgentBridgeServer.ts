/**
 * AgentBridgeServer - 本地 HTTP 桥（教练接口）
 *
 * 目的：让外部程序（如 Claude Code 扮演的"教练"）无需 UI 即可驱动 agent：
 *   - 下达任务（POST /api/chat）→ 走 AgentRunner 完整工具循环
 *   - 读取完整轨迹（assistant 的 tool_calls + tool 的执行结果）
 *   - 从而形成 任务 → 观察 → 反馈 → 沉淀 SKILL 的闭环
 *
 * 安全约束：
 *   - 仅监听 127.0.0.1（不暴露局域网）
 *   - 默认关闭，需在 .config/config.json 中开启：
 *       "settings": { "agentBridge": { "enabled": true, "port": 17871, "token": "可选" } }
 *   - 配置了 token 时要求请求头 Authorization: Bearer <token>
 *
 * 端点：
 *   GET  /api/health                       → 服务状态
 *   GET  /api/conversations                → 会话列表
 *   GET  /api/conversations/:id/messages   → 某会话全部消息（含解析后的 toolCalls）
 *   POST /api/chat                         → 驱动 agent 一轮
 *        body: { message: string, conversationId?: string, title?: string }
 *        返回: { success, conversationId, reply, error, messages[] }（messages 为本轮完整轨迹）
 */

import * as http from 'http';
import { app, BrowserWindow, WebContents } from 'electron';
import * as fs from 'fs';
import { getPathManager } from '../config/PathManager';
import {
  getAllConversations,
  getConversationById,
  createConversation,
  createMessage,
  createMessages,
  touchConversation,
  getMessagesByConversationId,
} from '../db';
import { getMainWindow } from '../ipc/workspace';
import { runAgentTurn, safeStringify, isAgentTurnRunning } from '../core/AgentRunner';

interface BridgeSettings {
  enabled: boolean;
  port: number;
  token?: string;
}

const DEFAULT_PORT = 17871;

function readBridgeSettings(): BridgeSettings {
  try {
    // 统一走 PathManager，避免与主链路 config.json 路径分叉
    const configPath = getPathManager().getAppConfigPath();
    if (!fs.existsSync(configPath)) return { enabled: false, port: DEFAULT_PORT };
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const bridge = raw?.settings?.agentBridge;
    if (!bridge || typeof bridge !== 'object') return { enabled: false, port: DEFAULT_PORT };
    return {
      enabled: bridge.enabled === true,
      port: typeof bridge.port === 'number' && bridge.port > 0 ? bridge.port : DEFAULT_PORT,
      token: typeof bridge.token === 'string' && bridge.token ? bridge.token : undefined,
    };
  } catch (e) {
    console.warn('[AgentBridge] 读取配置失败，桥保持关闭:', e);
    return { enabled: false, port: DEFAULT_PORT };
  }
}

function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 向所有窗口广播（与 JobDispatcher 相同语义） */
function broadcast(channel: string, data?: any): void {
  for (const w of BrowserWindow.getAllWindows()) {
    try {
      w.webContents.send(channel, data);
    } catch {
      // 忽略未就绪窗口
    }
  }
}

/**
 * 获取 sender（WebContents）。优先主窗口；没有则创建一个隐藏窗口兜底——
 * AgentRunner 需要 sender.send 推流式事件，ask_user 等工具也依赖它。
 */
let fallbackWindow: BrowserWindow | null = null;
function getSender(): WebContents {
  const main = getMainWindow();
  if (main && !main.isDestroyed()) return main.webContents;
  if (!fallbackWindow || fallbackWindow.isDestroyed()) {
    fallbackWindow = new BrowserWindow({ show: false, skipTaskbar: true });
    fallbackWindow.on('closed', () => { fallbackWindow = null; });
    console.log('[AgentBridge] 主窗口不可用，已创建隐藏窗口作为事件接收端');
  }
  return fallbackWindow.webContents;
}

/** DB 消息行 → LLM 消息格式（normalizeMessagesForLLM 兼容 camelCase/snake_case） */
function dbRowsToLlmMessages(rows: ReturnType<typeof getMessagesByConversationId>): any[] {
  return rows.map((m) => ({
    role: m.role,
    content: m.content ?? '',
    tool_calls: m.toolCalls ? safeJsonParse(m.toolCalls) : undefined,
    tool_call_id: m.tool_call_id ?? undefined,
    // DeepSeek 思考模式 + tools 时，历史 assistant 消息必须回传 reasoning_content，
    // 否则第二轮起 400。openai.ts sanitizeMessages 读取 reasoning_content ?? thinkingContent
    thinkingContent: (m as any).thinkingContent ?? undefined,
  }));
}

function safeJsonParse(s: string): any {
  try { return JSON.parse(s); } catch { return undefined; }
}

/** 读取请求体（JSON，上限 10MB） */
function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > 10 * 1024 * 1024) {
        reject(new Error('请求体超过 10MB 上限'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

function sendJson(res: http.ServerResponse, status: number, data: any): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

// ============================================================================
// POST /api/chat — 核心：驱动 agent 一轮
// ============================================================================

// bridge 层互斥标志：消除 isAgentTurnRunning 检查与 runAgentTurn 之间的竞态窗口
// （两个并发 POST /api/chat 可能都通过检查后一起进入 runAgentTurn）
let bridgeBusy = false;

async function handleChat(payload: { message: string; conversationId?: string; title?: string }): Promise<any> {
  const message = (payload.message ?? '').trim();
  if (!message) return { success: false, error: 'message 不能为空' };

  // 互斥：runAgentTurn 的 AbortController 是单例，并发启动会静默打断
  // 用户正在进行的对话（UI 流式输出莫名中断）。忙时直接拒绝。
  if (bridgeBusy || isAgentTurnRunning()) {
    return { success: false, busy: true, error: '已有 agent 任务在执行（可能是用户对话或后台任务），请稍后重试' };
  }
  bridgeBusy = true;
  try {
    return await handleChatInner(payload);
  } finally {
    bridgeBusy = false;
  }
}

async function handleChatInner(payload: { message: string; conversationId?: string; title?: string }): Promise<any> {
  const message = (payload.message ?? '').trim();

  // 1. 解析/创建会话
  let conversationId = payload.conversationId;
  if (conversationId) {
    if (!getConversationById(conversationId)) {
      return { success: false, error: `会话 ${conversationId} 不存在` };
    }
  } else {
    const conv = await createConversation({
      id: genId('bridge'),
      title: payload.title || '🎓 教练驱动',
    });
    conversationId = conv.id;
    broadcast('conversation:listChanged');
  }

  // 2. 加载历史 + 持久化本次 user 消息
  const history = dbRowsToLlmMessages(getMessagesByConversationId(conversationId));
  const userMsgId = genId('m');
  await createMessage({
    id: userMsgId,
    conversation_id: conversationId,
    role: 'user',
    content: message,
    timestamp: Date.now(),
  });
  await touchConversation(conversationId);
  broadcast('chat:messageInjected', {
    conversationId,
    message: { id: userMsgId, role: 'user', content: message, timestamp: Date.now() },
  });

  // 3. 执行 agent turn（带完整历史，与 UI 聊天语义一致）
  const result = await runAgentTurn({
    conversationId,
    messages: [...history, { role: 'user', content: message }],
    sender: getSender(),
    source: 'bridge',
  });

  // 4. 持久化 agent 产生的消息（只入库本轮新增部分）
  // result.messages 是完整历史 + 本轮新消息：从最后一条与本轮 user 内容相同的
  // 消息之后截取，之前的历史已在库中，重复入库会导致会话消息成倍膨胀
  if (result.success && result.messages && result.messages.length > 1) {
    let userIdx = -1;
    for (let i = result.messages.length - 1; i >= 0; i--) {
      const m = result.messages[i];
      if (m.role === 'user' && m.content === message) { userIdx = i; break; }
    }
    const newMessages = result.messages.slice(userIdx + 1)
      .filter((m: any) => m.role === 'assistant' || m.role === 'tool')
      .map((m: any) => ({
        id: (typeof m.id === 'string' && m.id.startsWith('assistant-')) ? m.id : genId('m'),
        conversation_id: conversationId,
        role: m.role,
        content: typeof m.content === 'string' ? m.content : (m.content == null ? '' : safeStringify(m.content)),
        timestamp: Date.now(),
        tool_call_id: m.tool_call_id,
        toolCalls: m.tool_calls ? JSON.stringify(m.tool_calls) : undefined,
        // 思考内容持久化：DeepSeek 思考模式多轮续传要求历史 assistant 消息带回
        thinkingContent: (m.thinkingContent ?? m.reasoning_content) || undefined,
      }));
    if (newMessages.length > 0) {
      try {
        await createMessages(newMessages);
        await touchConversation(conversationId);
        broadcast('chat:messageInjected', { conversationId, refresh: true });
      } catch (e) {
        console.error('[AgentBridge] 持久化 agent 消息失败:', e);
      }
    }
  }

  return {
    success: result.success,
    conversationId,
    reply: result.content || '',
    error: result.error,
    // 本轮完整轨迹（含 assistant tool_calls 与 tool 结果），供教练审查
    messages: result.messages ?? [],
  };
}

// ============================================================================
// HTTP 服务
// ============================================================================

function createServer(settings: BridgeSettings): http.Server {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');

    // token 校验
    if (settings.token) {
      const auth = req.headers['authorization'] || '';
      if (auth !== `Bearer ${settings.token}`) {
        return sendJson(res, 401, { success: false, error: 'unauthorized' });
      }
    }

    try {
      // ---- 健康检查 ----
      if (req.method === 'GET' && url.pathname === '/api/health') {
        return sendJson(res, 200, { ok: true, service: 'agent-bridge', port: settings.port });
      }

      // ---- 会话列表 ----
      if (req.method === 'GET' && url.pathname === '/api/conversations') {
        const list = getAllConversations()
          .sort((a, b) => b.updated_at - a.updated_at)
          .map((c) => ({ id: c.id, title: c.title, updatedAt: c.updated_at }));
        return sendJson(res, 200, { success: true, conversations: list });
      }

      // ---- 会话消息 ----
      const msgMatch = url.pathname.match(/^\/api\/conversations\/([^/]+)\/messages$/);
      if (req.method === 'GET' && msgMatch) {
        const id = decodeURIComponent(msgMatch[1]);
        if (!getConversationById(id)) {
          return sendJson(res, 404, { success: false, error: `会话 ${id} 不存在` });
        }
        const messages = getMessagesByConversationId(id).map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          timestamp: m.timestamp,
          toolCalls: m.toolCalls ? safeJsonParse(m.toolCalls) : undefined,
          toolCallId: m.tool_call_id || undefined,
        }));
        return sendJson(res, 200, { success: true, conversationId: id, messages });
      }

      // ---- 驱动 agent ----
      if (req.method === 'POST' && url.pathname === '/api/chat') {
        const raw = await readBody(req);
        let payload: any;
        try {
          payload = JSON.parse(raw);
        } catch {
          return sendJson(res, 400, { success: false, error: '请求体不是合法 JSON' });
        }
        const started = Date.now();
        const result = await handleChat(payload);
        console.log(`[AgentBridge] /api/chat 完成 (${((Date.now() - started) / 1000).toFixed(1)}s) success=${result.success}${result.busy ? ' (busy, 409)' : ''}`);
        return sendJson(res, result.success ? 200 : (result.busy ? 409 : 500), result);
      }

      return sendJson(res, 404, { success: false, error: `未知路径 ${req.method} ${url.pathname}` });
    } catch (e: any) {
      console.error('[AgentBridge] 请求处理失败:', e);
      return sendJson(res, 500, { success: false, error: e?.message || String(e) });
    }
  });
}

/**
 * 启动桥（在 app.whenReady、核心系统初始化之后调用）。
 * 未开启时不做任何事。
 */
export function maybeStartAgentBridge(): void {
  const settings = readBridgeSettings();
  if (!settings.enabled) {
    console.log('[AgentBridge] 未启用（settings.agentBridge.enabled != true）');
    return;
  }
  const server = createServer(settings);
  // agent 任务可能跑很久（多轮工具调用），不做服务器级超时
  server.requestTimeout = 0;
  server.headersTimeout = 0;
  server.listen(settings.port, '127.0.0.1', () => {
    console.log(`[AgentBridge] ✅ 本地桥已启动: http://127.0.0.1:${settings.port} (token: ${settings.token ? '已启用' : '无'})`);
    if (!settings.token) {
      console.warn('[AgentBridge] ⚠️ 未配置 token：本机任意进程均可驱动 agent（含 bash 等工具），建议在 .config/config.json 的 settings.agentBridge.token 中设置访问令牌');
    }
  });
  server.on('error', (e) => {
    console.error(`[AgentBridge] ❌ 启动失败（端口 ${settings.port}）:`, e);
  });

  app.on('before-quit', () => {
    try { server.close(); } catch { /* ignore */ }
    if (fallbackWindow && !fallbackWindow.isDestroyed()) fallbackWindow.destroy();
  });
}
