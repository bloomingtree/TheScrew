/**
 * SessionSummarizer
 * 在会话结束时或每日定时任务中，对对话内容进行结构化总结
 *
 * 三层记忆架构：
 * - 第一层：短期记忆（Session Context） - 当前对话的完整消息
 * - 第二层：工作记忆（Daily Summary） - 每日会话总结
 * - 第三层：长期记忆（Core Memory） - 用户画像和偏好
 */

import { readFile, writeFile, mkdir, readdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { getPathManager } from '../config/PathManager';
import { getAppConfigStore } from '../config/AppConfigStore';
import { OpenAIClient } from '../api/openai';

// ==================== 类型定义 ====================

export interface SessionSummary {
  sessionId: string;
  title: string;
  startTime: number;
  endTime: number;
  topics: string[];
  keyDecisions: string[];
  outputFiles: string[];
  userPreferences: string[];
  followUps: string[];
  summary: string;
}

export interface DailySummary {
  date: string;
  totalSessions: number;
  summaries: SessionSummary[];
  dailySummary: string;
  generatedAt: number;
}

// ==================== 总结 Prompt ====================

const SUMMARIZE_PROMPT = `你是一个记忆助手。请分析以下对话，提取关键信息并以 JSON 格式返回。

需要提取的信息：
1. topics: 对话涉及的主要话题（数组，每个不超过10字）
2. keyDecisions: 做出的重要决策（数组）
3. outputFiles: 创建或修改的文件（数组）
4. userPreferences: 暴露出的用户偏好（数组）
5. followUps: 需要后续跟进的事项（数组）
6. summary: 100字以内的对话摘要（字符串）

对话内容：
{messages}

请严格返回 JSON 格式，不要包含其他内容。格式如下：
{"topics":[],"keyDecisions":[],"outputFiles":[],"userPreferences":[],"followUps":[],"summary":""}`;

// ==================== SessionSummarizer ====================

class SessionSummarizerClass {
  private pathManager = getPathManager();

  /**
   * 总结单个会话
   */
  async summarizeSession(
    sessionId: string,
    messages: any[],
    title?: string
  ): Promise<SessionSummary | null> {
    // P2-1 规范：消息数 < 6 跳过总结，避免空对话浪费 LLM 调用
    if (messages.length < 6) {
      console.log(`[SessionSummarizer] 会话消息太少（${messages.length} < 6），跳过总结`);
      return null;
    }

    try {
      const config = getAppConfigStore().getActiveConfig();
      if (!config?.apiKey) {
        console.warn('[SessionSummarizer] 无可用 API 配置，跳过总结');
        return null;
      }

      // 构建用于总结的消息（限制长度，避免 token 爆炸）
      const contentForSummary = this.extractMessageContent(messages, 4000);
      const prompt = SUMMARIZE_PROMPT.replace('{messages}', contentForSummary);

      // 调用 LLM 进行总结
      const client = new OpenAIClient(
        config.baseUrl,
        config.apiKey,
        config.model,
        0.3, // 低温度，确保一致性
        1000 // 限制输出 token
      );

      const llmMessages = [{ role: 'user', content: prompt }];
      const chunks: string[] = [];

      for await (const chunk of client.streamChat(llmMessages, undefined, [])) {
        try {
          JSON.parse(chunk);
          // 跳过非文本 chunk
        } catch {
          chunks.push(chunk);
        }
      }

      const responseText = chunks.join('').trim();
      const summary = this.parseSummaryResponse(responseText, sessionId, messages, title);

      // 保存结构化 JSON 到 session_summaries/{sessionId}.json（保留原始数据备份）
      await this.saveSessionSummary(summary);

      // 追加 markdown 段到 daily/{今天}.md（供 ContextBuilder 读取注入到 system prompt）
      await this.appendSummaryToDaily(summary);

      return summary;
    } catch (error: any) {
      console.error('[SessionSummarizer] 总结失败:', error.message);
      return null;
    }
  }

  /**
   * 将会话总结格式化为 markdown 段并追加到当日 daily 笔记（daily/{今天}.md）
   *
   * 段头格式：### HH:MM 会话总结
   * 包含字段：summary 文本 + keyDecisions + outputFiles + userPreferences + followUps
   *
   * 与 ContextBuilder._buildMemorySection() 读取的路径完全一致：
   *   `{memoryPath}/daily/YYYY-MM-DD.md`
   */
  async appendSummaryToDaily(summary: SessionSummary): Promise<void> {
    const dailyDir = join(this.pathManager.getMemoryPath(), 'daily');
    await mkdir(dailyDir, { recursive: true });

    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const dailyPath = join(dailyDir, `${today}.md`);

    // 构造 markdown 段
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const section = this.formatSummaryAsMarkdown(summary, `${hh}:${mm}`);

    // 读取已有内容（若文件不存在则用日期标题作为起始）
    let existing = '';
    if (existsSync(dailyPath)) {
      try {
        existing = await readFile(dailyPath, 'utf-8');
      } catch {
        existing = '';
      }
    } else {
      existing = `# ${today} 工作笔记\n`;
    }

    // 追加段（确保与已有内容之间有空行分隔）
    const sep = existing.length > 0 && !existing.endsWith('\n') ? '\n\n' : (existing.endsWith('\n') ? '' : '\n');
    const newContent = existing + (existing.endsWith('\n') && !existing.endsWith('\n\n') ? '\n' : sep) + section;

    await writeFile(dailyPath, newContent, 'utf-8');
    console.log(`[SessionSummarizer] 已追加会话总结到 daily/${today}.md`);
  }

  /**
   * 将 SessionSummary 格式化为 markdown 段（不含文件 I/O，便于测试）
   */
  private formatSummaryAsMarkdown(summary: SessionSummary, hhmm: string): string {
    const lines: string[] = [];
    lines.push(`### ${hhmm} 会话总结`);
    lines.push('');
    lines.push(`**会话**：${summary.title}（${summary.sessionId.slice(0, 8)}）`);
    lines.push('');
    if (summary.summary) {
      lines.push(`**摘要**：${summary.summary}`);
      lines.push('');
    }
    if (summary.topics.length > 0) {
      lines.push(`**话题**：${summary.topics.join('、')}`);
      lines.push('');
    }
    if (summary.keyDecisions.length > 0) {
      lines.push(`**关键决策**：`);
      for (const d of summary.keyDecisions) lines.push(`- ${d}`);
      lines.push('');
    }
    if (summary.outputFiles.length > 0) {
      lines.push(`**输出文件**：`);
      for (const f of summary.outputFiles) lines.push(`- ${f}`);
      lines.push('');
    }
    if (summary.userPreferences.length > 0) {
      lines.push(`**用户偏好**：`);
      for (const p of summary.userPreferences) lines.push(`- ${p}`);
      lines.push('');
    }
    if (summary.followUps.length > 0) {
      lines.push(`**后续跟进**：`);
      for (const f of summary.followUps) lines.push(`- ${f}`);
      lines.push('');
    }
    return lines.join('\n');
  }

  /**
   * 将会话总结追加到当日工作记忆（JSON 格式备份）
   * @deprecated P2 改用 appendSummaryToDaily（markdown 段），本方法保留以兼容外部调用
   */
  async appendToDailyNote(summary: SessionSummary): Promise<void> {
    const dailySummariesDir = this.pathManager.getDailySummariesPath();
    await mkdir(dailySummariesDir, { recursive: true });

    const today = new Date().toISOString().split('T')[0];
    const dailyPath = join(dailySummariesDir, `${today}.json`);

    let dailyData: DailySummary;
    try {
      const data = await readFile(dailyPath, 'utf-8');
      dailyData = JSON.parse(data);
    } catch {
      dailyData = {
        date: today,
        totalSessions: 0,
        summaries: [],
        dailySummary: '',
        generatedAt: Date.now(),
      };
    }

    dailyData.summaries.push(summary);
    dailyData.totalSessions = dailyData.summaries.length;
    dailyData.generatedAt = Date.now();

    await writeFile(dailyPath, JSON.stringify(dailyData, null, 2), 'utf-8');
    console.log(`[SessionSummarizer] 已追加到 ${today} 的工作记忆`);
  }

  /**
   * 从工作记忆中提炼长期记忆更新
   */
  async consolidateToLongTerm(days: number = 7): Promise<{
    updated: boolean;
    newEntries: string[];
  }> {
    const dailySummariesDir = this.pathManager.getDailySummariesPath();

    try {
      const files = await readdir(dailySummariesDir);
      const summaryFiles = files.filter(f => f.endsWith('.json')).sort().reverse();

      const recentSummaries: SessionSummary[] = [];
      let checkedDays = 0;

      for (const file of summaryFiles) {
        if (checkedDays >= days) break;
        try {
          const data = await readFile(join(dailySummariesDir, file), 'utf-8');
          const daily: DailySummary = JSON.parse(data);
          recentSummaries.push(...daily.summaries);
        } catch { /* skip */ }
        checkedDays++;
      }

      if (recentSummaries.length === 0) {
        return { updated: false, newEntries: [] };
      }

      // 提取用户偏好和重要信息
      const preferences = new Set<string>();
      const topics = new Set<string>();

      for (const s of recentSummaries) {
        for (const p of s.userPreferences) preferences.add(p);
        for (const t of s.topics) topics.add(t);
      }

      if (preferences.size === 0 && topics.size === 0) {
        return { updated: false, newEntries: [] };
      }

      // 追加到长期记忆
      const longTermPath = join(this.pathManager.getMemoryPath(), 'long_term.md');
      let longTerm = '';
      if (existsSync(longTermPath)) {
        longTerm = await readFile(longTermPath, 'utf-8');
      } else {
        longTerm = '# 长期记忆\n\n';
      }

      const timestamp = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
      let newSection = `\n## 记忆提炼 (${timestamp})\n\n`;

      if (preferences.size > 0) {
        newSection += '### 用户偏好\n';
        for (const p of preferences) {
          newSection += `- ${p}\n`;
        }
        newSection += '\n';
      }

      if (topics.size > 0) {
        newSection += '### 常见话题\n';
        for (const t of topics) {
          newSection += `- ${t}\n`;
        }
        newSection += '\n';
      }

      await writeFile(longTermPath, longTerm + newSection, 'utf-8');

      const newEntries = [...preferences, ...topics];
      return { updated: true, newEntries };
    } catch (error: any) {
      console.error('[SessionSummarizer] 长期记忆提炼失败:', error.message);
      return { updated: false, newEntries: [] };
    }
  }

  /**
   * 获取指定日期的总结
   */
  async getDailySummary(date: string): Promise<DailySummary | null> {
    const dailyPath = join(this.pathManager.getDailySummariesPath(), `${date}.json`);
    try {
      const data = await readFile(dailyPath, 'utf-8');
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  /**
   * 获取近几日的总结
   */
  async getRecentSummaries(days: number = 7): Promise<DailySummary[]> {
    const results: DailySummary[] = [];
    const dailySummariesDir = this.pathManager.getDailySummariesPath();
    const today = new Date();

    for (let i = 0; i < days; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const summary = await this.getDailySummary(dateStr);
      if (summary) results.push(summary);
    }

    return results;
  }

  /**
   * 构建近 7 日工作记忆的文本（注入到系统提示中）
   */
  async buildRecentMemoryText(maxTokens: number = 800): Promise<string> {
    const summaries = await this.getRecentSummaries(7);
    if (summaries.length === 0) return '';

    const lines: string[] = [];
    for (const daily of summaries) {
      lines.push(`### ${daily.date} (${daily.totalSessions} 个会话)`);
      for (const s of daily.summaries.slice(0, 5)) {
        lines.push(`- ${s.summary}`);
      }
      if (daily.summaries.length > 5) {
        lines.push(`- ... 还有 ${daily.summaries.length - 5} 个会话`);
      }
    }

    let text = lines.join('\n');
    // 粗略截断
    const maxChars = maxTokens * 2;
    if (text.length > maxChars) {
      text = text.slice(0, maxChars) + '\n...(内容过长，已截断)';
    }

    return `## 近期工作记忆\n\n${text}`;
  }

  // ==================== 私有方法 ====================

  private extractMessageContent(messages: any[], maxChars: number): string {
    const parts: string[] = [];
    let totalChars = 0;

    // 从最新消息开始，向前提取
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === 'tool') continue;

      const content = typeof msg.content === 'string'
        ? msg.content
        : JSON.stringify(msg.content);
      const role = msg.role === 'user' ? '用户' : 'AI';
      const line = `[${role}]: ${content.slice(0, 500)}`;

      if (totalChars + line.length > maxChars) break;
      parts.unshift(line);
      totalChars += line.length;
    }

    return parts.join('\n');
  }

  private parseSummaryResponse(
    responseText: string,
    sessionId: string,
    messages: any[],
    title?: string
  ): SessionSummary {
    // 尝试解析 JSON
    let parsed: any = {};
    try {
      // 去掉可能的 markdown 代码块标记
      let cleanText = responseText.trim();
      if (cleanText.startsWith('```json')) {
        cleanText = cleanText.slice(7);
      }
      if (cleanText.startsWith('```')) {
        cleanText = cleanText.slice(3);
      }
      if (cleanText.endsWith('```')) {
        cleanText = cleanText.slice(0, -3);
      }
      parsed = JSON.parse(cleanText.trim());
    } catch {
      // JSON 解析失败，使用默认值
      parsed = {
        topics: [],
        keyDecisions: [],
        outputFiles: [],
        userPreferences: [],
        followUps: [],
        summary: responseText.slice(0, 200),
      };
    }

    return {
      sessionId,
      title: title || `会话 ${sessionId.slice(0, 8)}`,
      startTime: messages[0]?.timestamp || Date.now(),
      endTime: messages[messages.length - 1]?.timestamp || Date.now(),
      topics: Array.isArray(parsed.topics) ? parsed.topics : [],
      keyDecisions: Array.isArray(parsed.keyDecisions) ? parsed.keyDecisions : [],
      outputFiles: Array.isArray(parsed.outputFiles) ? parsed.outputFiles : [],
      userPreferences: Array.isArray(parsed.userPreferences) ? parsed.userPreferences : [],
      followUps: Array.isArray(parsed.followUps) ? parsed.followUps : [],
      summary: parsed.summary || '对话已总结',
    };
  }

  private async saveSessionSummary(summary: SessionSummary): Promise<void> {
    const summariesDir = this.pathManager.getSessionSummariesPath();
    await mkdir(summariesDir, { recursive: true });

    const filePath = join(summariesDir, `${summary.sessionId}.json`);
    await writeFile(filePath, JSON.stringify(summary, null, 2), 'utf-8');
    console.log(`[SessionSummarizer] 已保存会话总结: ${summary.sessionId}`);
  }
}

// 单例
let instance: SessionSummarizerClass | null = null;

export function getSessionSummarizer(): SessionSummarizerClass {
  if (!instance) {
    instance = new SessionSummarizerClass();
  }
  return instance;
}

export default SessionSummarizerClass;
