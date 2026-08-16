/**
 * MemoryTools - 长期记忆管理工具
 *
 * 为 AI 提供 3 个工具来读写自己的长期记忆：
 * - memory_save:   写入/更新/合并记忆到 MEMORY.md | topics/*.md | daily/YYYY-MM-DD.md
 * - memory_search: 按关键词搜索记忆文件（纯 Node.js，无子进程）
 * - memory_read:   读取指定记忆文件全文
 *
 * 路径来源：PathManager.getMemoryPath()（与 MemoryStore 共用同一目录）
 */

import * as fs from 'fs';
import * as path from 'path';
import { Tool } from './ToolManager';
import { getPathManager } from '../config/PathManager';

// ==================== 类型与常量 ====================

type MemoryTopic =
  | 'memory-index'
  | 'user-profile'
  | 'project-facts'
  | 'recurring-bugs'
  | 'debugging-notes'
  | 'daily-note';

const VALID_TOPICS: MemoryTopic[] = [
  'memory-index',
  'user-profile',
  'project-facts',
  'recurring-bugs',
  'debugging-notes',
  'daily-note',
];

const VALID_MODES = ['append', 'replace', 'merge-section'] as const;
type SaveMode = (typeof VALID_MODES)[number];

const VALID_SCOPES = ['all', 'index', 'topics', 'daily'] as const;
type SearchScope = (typeof VALID_SCOPES)[number];

// ==================== 路径辅助 ====================

/**
 * 获取记忆根目录（PathManager.getMemoryPath()）
 * 与 MemoryStore 完全一致，保证读写同一位置。
 */
function getMemoryPath(): string {
  return getPathManager().getMemoryPath();
}

/**
 * 根据 topic 返回目标文件绝对路径
 * - memory-index → MEMORY.md
 * - daily-note   → daily/YYYY-MM-DD.md
 * - 其他         → topics/{topic}.md
 */
function resolveTopicPath(topic: MemoryTopic): string {
  const root = getMemoryPath();
  if (topic === 'memory-index') {
    return path.join(root, 'MEMORY.md');
  }
  if (topic === 'daily-note') {
    const today = todayDateString();
    return path.join(root, 'daily', `${today}.md`);
  }
  return path.join(root, 'topics', `${topic}.md`);
}

/**
 * 今天的日期字符串 YYYY-MM-DD（本地时区）
 */
function todayDateString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 确保目标文件所在目录存在
 */
function ensureDirFor(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// ==================== merge-section 辅助 ====================

/**
 * 合并章节：基于 markdown `## {sectionTitle}` 定位章节
 * - 存在：替换该章节内容（到下一个 `## ` 或文件末尾）
 * - 不存在：追加 `## {sectionTitle}\n\n{content}\n`
 */
function mergeSection(fileContent: string, sectionTitle: string, content: string): string {
  const lines = fileContent.split('\n');
  const header = `## ${sectionTitle}`;
  // 标题行匹配：以 "## " 开头，忽略前导空格
  const headerRegex = /^\s*##\s+(.+?)\s*$/;

  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = headerRegex.exec(lines[i]);
    if (m && m[1] === sectionTitle) {
      startIdx = i;
      break;
    }
  }

  // 章节不存在：追加
  if (startIdx === -1) {
    const suffix = fileContent.endsWith('\n') ? '' : '\n';
    return `${fileContent}${suffix}\n${header}\n\n${content}\n`;
  }

  // 章节存在：找到下一个 ## 或文件末尾
  let endIdx = lines.length;
  for (let j = startIdx + 1; j < lines.length; j++) {
    if (headerRegex.test(lines[j])) {
      endIdx = j;
      break;
    }
  }

  const before = lines.slice(0, startIdx).join('\n');
  const after = lines.slice(endIdx).join('\n');
  // 重组：before + header + 空行 + content + 空行 + after
  const parts: string[] = [];
  if (before.length > 0) parts.push(before);
  parts.push(header, '', content);
  // 处理 after 前后的换行
  const trimmedAfter = after.replace(/^\n+/, '');
  if (trimmedAfter.length > 0) {
    parts.push(''); // 分隔空行
    parts.push(trimmedAfter);
  }
  return parts.join('\n');
}

// ==================== 工具定义 ====================

/**
 * memory_save - 写入或更新长期记忆
 */
const memorySaveTool: Tool = {
  name: 'memory_save',
  description: `写入或更新长期记忆。

**何时写入**：
- 用户明确说"记住这个" / "以后都这样"
- 反复出现 2 次以上的偏好或问题
- 完成复杂任务后的关键决策、最终方案
- 重要事实（项目结构、配置位置、API 端点）

**何时不写入**：
- 当前会话临时状态（如"正在编辑 a.docx"）
- 未验证的猜测
- 工具调用细节（这些在对话历史里就够了）

**写入前必须**：
1. 先调用 memory_search 检查是否已有相关条目
2. 若已存在，使用 mode=merge-section 更新；不要 append 重复内容

**topic 选择**：
- memory-index: 高度抽象的索引（写入 MEMORY.md）
- user-profile: 用户姓名、职业、语言偏好、工作习惯
- project-facts: 项目路径、架构、关键文件
- recurring-bugs: 反复出现的 bug 和修复方案
- debugging-notes: 调试技巧和经验
- daily-note: 当日重要事件、决策`,
  parameters: {
    type: 'object',
    properties: {
      topic: {
        type: 'string',
        description: '记忆主题，决定写入哪个文件',
        enum: VALID_TOPICS,
      },
      content: {
        type: 'string',
        description: '要写入的内容（markdown 片段）',
      },
      mode: {
        type: 'string',
        description:
          '写入模式：append（默认，追加到文件末尾）、replace（完全覆盖，危险）、merge-section（按 ## 标题更新指定章节）',
        enum: VALID_MODES,
        default: 'append',
      },
      sectionTitle: {
        type: 'string',
        description: '当 mode=merge-section 时必填，目标章节的标题文字（不含 "## " 前缀）',
      },
    },
    required: ['topic', 'content'],
  },
  handler: async (args: any) => {
    try {
      const {
        topic,
        content,
        mode = 'append',
        sectionTitle,
      } = args as {
        topic: MemoryTopic;
        content: string;
        mode?: SaveMode;
        sectionTitle?: string;
      };

      // 参数校验
      if (!topic || !VALID_TOPICS.includes(topic)) {
        return { success: false, error: `无效的 topic "${topic}"，可选值：${VALID_TOPICS.join(', ')}` };
      }
      if (typeof content !== 'string' || content.length === 0) {
        return { success: false, error: 'content 必须是非空字符串' };
      }
      if (!VALID_MODES.includes(mode)) {
        return { success: false, error: `无效的 mode "${mode}"，可选值：${VALID_MODES.join(', ')}` };
      }
      if (mode === 'merge-section' && (!sectionTitle || sectionTitle.trim().length === 0)) {
        return {
          success: false,
          error: 'mode=merge-section 时必须提供非空的 sectionTitle',
        };
      }

      const filePath = resolveTopicPath(topic);
      ensureDirFor(filePath);

      let action: string;
      let newContent: string;

      // 文件已有内容（不存在视为空）
      let existingContent = '';
      if (fs.existsSync(filePath)) {
        existingContent = fs.readFileSync(filePath, 'utf-8');
      }

      switch (mode) {
        case 'append': {
          action = 'append';
          // 文件末尾追加（确保前面有空行）
          const sep = existingContent.length > 0 && !existingContent.endsWith('\n') ? '\n\n' : '';
          const prefix = existingContent.length === 0 ? '' : sep;
          newContent = existingContent + prefix + content + '\n';
          break;
        }
        case 'replace': {
          action = 'replace';
          newContent = content + '\n';
          break;
        }
        case 'merge-section': {
          action = 'merge-section';
          newContent = mergeSection(existingContent, sectionTitle!.trim(), content);
          break;
        }
        default:
          return { success: false, error: `未实现的 mode: ${mode}` };
      }

      fs.writeFileSync(filePath, newContent, 'utf-8');
      const stats = fs.statSync(filePath);

      return {
        success: true,
        path: filePath,
        bytes: stats.size,
        action,
      };
    } catch (error: any) {
      return { success: false, error: error?.message || String(error) };
    }
  },
};

// ==================== memory_search ====================

interface SearchMatch {
  file: string;       // 相对于 memoryPath 的路径
  line: string;       // 匹配的整行
  lineNumber: number; // 1-based
  preview: string;    // 匹配行 ± 50 字符上下文
}

/**
 * 在单个文件中按行搜索
 */
function searchInFile(filePath: string, queryLower: string, relPath: string): SearchMatch[] {
  const matches: SearchMatch[] = [];
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return matches;
  }
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.toLowerCase().includes(queryLower)) {
      // 构造 preview：当前行 ± 50 字符上下文
      const start = Math.max(0, line.length > 0 ? 0 : 0);
      // 简单实现：整行本身，如果超长则取 ± 50 字符
      let preview: string;
      const idx = line.toLowerCase().indexOf(queryLower);
      if (line.length <= 100) {
        preview = line;
      } else {
        const lo = Math.max(0, idx - 50);
        const hi = Math.min(line.length, idx + queryLower.length + 50);
        preview = (lo > 0 ? '...' : '') + line.slice(lo, hi) + (hi < line.length ? '...' : '');
      }
      void start; // 暂未使用 start，保留逻辑清晰
      matches.push({
        file: relPath,
        line,
        lineNumber: i + 1,
        preview,
      });
    }
  }
  return matches;
}

/**
 * 列出目录下所有 .md 文件（递归），返回相对于 memoryPath 的相对路径列表
 */
function listMarkdownFiles(dir: string, memoryRoot: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // 跳过 archive/、session_summaries/ 等非搜索目录
      if (entry.name === 'archive' || entry.name === 'session_summaries') continue;
      results.push(...listMarkdownFiles(full, memoryRoot));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(path.relative(memoryRoot, full).replace(/\\/g, '/'));
    }
  }
  return results;
}

/**
 * memory_search - 按关键词搜索记忆文件
 */
const memorySearchTool: Tool = {
  name: 'memory_search',
  description: `按关键词搜索记忆文件（MEMORY.md / topics/*.md / daily/*.md）。

**使用场景**：
- 在 memory_save 前检查是否已有相关条目，避免重复
- 回顾某个主题的历史决策
- 查找用户过去的偏好表达

**匹配规则**：
- 大小写不敏感的子串匹配
- 不支持正则、不支持分词（按精确子串）
- 扫描所有 .md 文件的每一行，返回匹配行 ± 50 字符的上下文

**返回**：每条 match 包含 file（相对路径）、lineNumber、preview。`,
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: '搜索关键词（大小写不敏感的子串）',
      },
      scope: {
        type: 'string',
        description: '搜索范围：all（默认）、index（仅 MEMORY.md）、topics（仅 topics/）、daily（仅 daily/）',
        enum: VALID_SCOPES,
        default: 'all',
      },
      limit: {
        type: 'number',
        description: '最大返回条数（默认 20）',
        default: 20,
      },
    },
    required: ['query'],
  },
  handler: async (args: any) => {
    try {
      const { query, scope = 'all', limit = 20 } = args as {
        query: string;
        scope?: SearchScope;
        limit?: number;
      };

      if (typeof query !== 'string' || query.length === 0) {
        return { success: false, error: 'query 必须是非空字符串' };
      }
      if (!VALID_SCOPES.includes(scope)) {
        return { success: false, error: `无效的 scope "${scope}"` };
      }
      const maxLimit = Math.max(1, Math.min(200, Math.floor(limit)));

      const memoryRoot = getMemoryPath();
      if (!fs.existsSync(memoryRoot)) {
        return { success: true, matches: [] };
      }

      const queryLower = query.toLowerCase();
      const allMatches: SearchMatch[] = [];

      // 确定要搜索的文件列表（相对路径）
      const filesToSearch: string[] = [];
      if (scope === 'all' || scope === 'index') {
        if (fs.existsSync(path.join(memoryRoot, 'MEMORY.md'))) {
          filesToSearch.push('MEMORY.md');
        }
      }
      if (scope === 'all' || scope === 'topics') {
        filesToSearch.push(...listMarkdownFiles(path.join(memoryRoot, 'topics'), memoryRoot));
      }
      if (scope === 'all' || scope === 'daily') {
        filesToSearch.push(...listMarkdownFiles(path.join(memoryRoot, 'daily'), memoryRoot));
      }

      for (const relPath of filesToSearch) {
        const full = path.join(memoryRoot, relPath);
        const matches = searchInFile(full, queryLower, relPath);
        allMatches.push(...matches);
        if (allMatches.length >= maxLimit) break;
      }

      return {
        success: true,
        matches: allMatches.slice(0, maxLimit),
        total: allMatches.length,
      };
    } catch (error: any) {
      return { success: false, error: error?.message || String(error) };
    }
  },
};

// ==================== memory_read ====================

/**
 * memory_read - 读取记忆文件全文
 */
const memoryReadTool: Tool = {
  name: 'memory_read',
  description: `读取记忆文件全文。

**target 格式**：
- \`index\`：读取 MEMORY.md
- \`topics/user-profile.md\`：读取指定相对路径
- \`daily:2026-07-28\`：读取指定日期的 daily 笔记

**使用场景**：
- 在 merge-section 前确认当前内容
- 用户询问"你还记得我之前说的 XX 吗"
- 工具调用前快速回顾一个 topic 文件的现状

**返回**：{ success, content, path }；文件不存在返回 { success: false, error } 而不抛错。`,
  parameters: {
    type: 'object',
    properties: {
      target: {
        type: 'string',
        description:
          '读取目标：index | 相对路径（如 topics/user-profile.md）| daily:YYYY-MM-DD',
      },
    },
    required: ['target'],
  },
  handler: async (args: any) => {
    try {
      const { target } = args as { target: string };

      if (typeof target !== 'string' || target.trim().length === 0) {
        return { success: false, error: 'target 必须是非空字符串' };
      }

      const memoryRoot = getMemoryPath();
      let filePath: string;
      let relPath: string;

      const t = target.trim();
      if (t === 'index') {
        relPath = 'MEMORY.md';
        filePath = path.join(memoryRoot, 'MEMORY.md');
      } else if (t.startsWith('daily:')) {
        const dateStr = t.slice('daily:'.length).trim();
        // 校验 YYYY-MM-DD 格式
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
          return {
            success: false,
            error: `daily 日期格式错误，应为 YYYY-MM-DD，收到 "${dateStr}"`,
          };
        }
        relPath = `daily/${dateStr}.md`;
        filePath = path.join(memoryRoot, 'daily', `${dateStr}.md`);
      } else {
        // 视为相对路径（禁止 .. 路径穿越）
        const normalized = path.normalize(t).replace(/\\/g, '/');
        if (normalized.startsWith('..') || path.isAbsolute(t)) {
          return {
            success: false,
            error: 'target 必须是相对路径或特殊值（index / daily:YYYY-MM-DD）',
          };
        }
        relPath = normalized;
        filePath = path.join(memoryRoot, normalized);
      }

      if (!fs.existsSync(filePath)) {
        return {
          success: false,
          error: `文件不存在: ${relPath}`,
          path: filePath,
        };
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      return {
        success: true,
        content,
        path: filePath,
      };
    } catch (error: any) {
      return { success: false, error: error?.message || String(error) };
    }
  },
};

// ==================== 导出 ====================

export const memoryTools: Tool[] = [memorySaveTool, memorySearchTool, memoryReadTool];
