/**
 * JobDispatcher - 定时任务的统一调度入口
 *
 * CronService.onJob 和 HeartbeatService.onHeartbeat 都调用 dispatchJob，
 * 由它根据 payload.target 分发到两条路径：
 *
 *   target='user'  → 提醒用户型：
 *     注入一条 assistant 提醒消息到对话 + 系统通知 + 唤起窗口。
 *     不触发 agent 执行。
 *
 *   target='agent' → Agent 自驱动型：
 *     注入一条 user 触发消息到对话 + 触发 runAgentTurn（调 LLM、用工具）。
 *     完成后把 agent 产生的 assistant/tool 消息持久化到 DB。
 *
 * 注入对话策略：优先当前激活对话（globalThis[activeConversationId]），
 * 没有则新建一个标题带图标前缀的对话。
 */

import { BrowserWindow } from 'electron';
import {
  createConversation,
  createMessage,
  createMessages,
  touchConversation,
  getConversationById,
} from '../db';
import { getMainWindow } from '../ipc/workspace';
import { showNotification, activateMainWindow } from '../notify';
import { runAgentTurn, safeStringify } from '../core/AgentRunner';
import type { CronJob } from './types';

// ============================================================================
// 工具函数
// ============================================================================

/** 向所有浏览器窗口广播事件（当前为单窗口应用） */
function broadcast(channel: string, data?: any): void {
  for (const w of BrowserWindow.getAllWindows()) {
    try {
      w.webContents.send(channel, data);
    } catch {
      // webContents 可能未就绪，忽略
    }
  }
}

/** 生成唯一消息 ID */
function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 解析目标对话：优先当前激活对话，没有则新建。
 */
async function resolveTargetConversation(job: CronJob): Promise<string> {
  const activeSymbol = Symbol.for('zero-employee:activeConversationId');
  const active = (globalThis as any)[activeSymbol] as string | null;

  if (active && getConversationById(active)) {
    return active;
  }

  // 没有激活对话，新建一个
  const titlePrefix = job.payload.target === 'user' ? '⏰' : '🔧';
  const conv = await createConversation({
    id: genId('cron'),
    title: `${titlePrefix} ${job.name}`,
  });

  // 通知前端刷新对话列表（前端监听 conversation:listChanged）
  broadcast('conversation:listChanged');

  console.log(`[JobDispatcher] Created new conversation '${conv.title}' (${conv.id}) for job '${job.name}'`);
  return conv.id;
}

// ============================================================================
// 核心调度函数
// ============================================================================

/**
 * 分发一个定时任务。
 *
 * @param job 任务定义
 * @param source 触发来源：'cron'（定时任务）或 'heartbeat'（后台巡检）
 * @returns 执行结果文本（供 HeartbeatService 判断 HEARTBEAT_OK）
 */
export async function dispatchJob(
  job: CronJob,
  source: 'cron' | 'heartbeat' = 'cron'
): Promise<string> {
  const conversationId = await resolveTargetConversation(job);
  const target = job.payload.target;

  console.log(`[JobDispatcher] Dispatching job '${job.name}' (target=${target}, source=${source}) → conversation ${conversationId}`);

  // ============================================================
  // 提醒用户型
  // ============================================================
  if (target === 'user') {
    const content = `⏰ 提醒：${job.payload.message}`;
    const msgId = genId('m');

    await createMessage({
      id: msgId,
      conversation_id: conversationId,
      role: 'assistant',
      content,
      timestamp: Date.now(),
    });
    await touchConversation(conversationId);

    // 实时推送给前端显示
    broadcast('chat:messageInjected', {
      conversationId,
      message: {
        id: msgId,
        role: 'assistant',
        content,
        timestamp: Date.now(),
      },
    });

    // 系统通知 + 唤起窗口
    showNotification({
      title: '螺丝钉提醒',
      body: job.payload.message,
      conversationId,
    });
    activateMainWindow(conversationId);

    return content;
  }

  // ============================================================
  // Agent 自驱动型
  // ============================================================
  const triggerLabel = source === 'heartbeat' ? '后台巡检' : '定时任务';
  const triggerContent = `[${triggerLabel}·${job.name}]\n${job.payload.message}`;
  const triggerMsgId = genId('m');

  // 注入 user 触发消息（持久化）
  await createMessage({
    id: triggerMsgId,
    conversation_id: conversationId,
    role: 'user',
    content: triggerContent,
    timestamp: Date.now(),
  });
  await touchConversation(conversationId);

  // 实时推送给前端显示触发消息
  broadcast('chat:messageInjected', {
    conversationId,
    message: {
      id: triggerMsgId,
      role: 'user',
      content: triggerContent,
      timestamp: Date.now(),
    },
  });

  const sender = getMainWindow()?.webContents;
  if (!sender) {
    throw new Error('[JobDispatcher] No main window webContents available for agent turn');
  }

  // 轻通知：告知用户后台任务已启动
  showNotification({
    title: '螺丝钉·后台任务',
    body: `正在执行：${job.name}`,
    conversationId,
  });

  // 执行 agent turn（fresh context，只含触发消息；agent 通过工具访问历史/记忆）
  const result = await runAgentTurn({
    conversationId,
    messages: [{ role: 'user', content: triggerContent }],
    sender,
    source,
  });

  // 持久化 agent 产生的消息（跳过第一条 user，已在上面持久化）
  if (result.success && result.messages && result.messages.length > 1) {
    const newMessages = result.messages.slice(1)
      .filter((m: any) => m.role === 'assistant' || m.role === 'tool')
      .map((m: any) => {
        const content = typeof m.content === 'string'
          ? m.content
          : (m.content == null ? '' : safeStringify(m.content));
        return {
          id: (typeof m.id === 'string' && m.id.startsWith('assistant-')) ? m.id : genId('m'),
          conversation_id: conversationId,
          role: m.role,
          content,
          timestamp: Date.now(),
          tool_call_id: m.tool_call_id,
          toolCalls: m.tool_calls ? JSON.stringify(m.tool_calls) : undefined,
        };
      });

    if (newMessages.length > 0) {
      try {
        await createMessages(newMessages);
        await touchConversation(conversationId);
        // 通知前端：agent turn 完成，当前若在看此对话应刷新
        broadcast('chat:messageInjected', {
          conversationId,
          refresh: true,
        });
        console.log(`[JobDispatcher] Persisted ${newMessages.length} agent messages for job '${job.name}'`);
      } catch (e) {
        console.error(`[JobDispatcher] Failed to persist agent messages for '${job.name}':`, e);
      }
    }
  }

  if (!result.success) {
    console.error(`[JobDispatcher] Agent turn failed for '${job.name}': ${result.error}`);
    return `Error: ${result.error}`;
  }

  return result.content || '';
}
