/**
 * Context Builder - nanobot style system prompt construction
 *
 * 基于 nanobot 的系统提示词构建器，实现完整的中文系统提示词生成
 *
 * 系统提示词结构：
 * 1. 核心身份 (中文)
 * 2. 时间信息 (中文)
 * 3. Bootstrap 文件 (IDENTITY.md, SOUL.md, USER.md, TOOLS.md)
 * 4. 内存 (长期记忆 + 今日笔记)
 * 5. 技能 (Always Skills 完整内容 + On-Demand Skills 摘要)
 * 6. 工具定义 (JSON Schema)
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { getSimpleSkillManager } from './SimpleSkillManager';
import { getMemoryStore, MEMORY_INDEX_MAX_LINES } from '../memory/MemoryStore';
import { getToolManager } from '../tools/ToolManager';
import { CONFIG_DIR_NAME, getPathManager } from '../config/PathManager';

/**
 * Context Builder options
 */
export interface ContextBuilderOptions {
  /** Workspace path (optional) */
  workspacePath?: string;
  /** Include memory in system prompt */
  includeMemory?: boolean;
  /** Maximum tokens for memory section */
  maxMemoryTokens?: number;
}

/**
 * Bootstrap file names
 */
const BOOTSTRAP_FILES = {
  IDENTITY: 'IDENTITY.md',
  SOUL: 'SOUL.md',
  USER: 'USER.md',
  TOOLS: 'TOOLS.md',
};

/**
 * 主动记忆规范（常驻注入）
 *
 * 这是记忆系统的行为驱动层：记忆本质是普通文件 + 路径约定，
 * 没有这段规范，AI 永远不会主动读写它们——daily 笔记为空，复盘任务也就无米下锅。
 * 参照 Claude Code 的 auto memory 指令逻辑复刻（记忆直接用通用文件工具操作）。
 */
const MEMORY_BEHAVIOR_RULES = `## 记忆维护规范（主动执行，极其重要）

你拥有跨会话的持久记忆系统，就是一组普通的 markdown 文件（位于配置目录 memory/ 下，所有文件工具传 namespace="config"）：

- \`memory/MEMORY.md\`：常驻索引（每次会话自动注入你的上下文，见下方），一行一条浓缩摘要
- \`memory/topics/*.md\`：主题文件，按语义命名（user-profile.md / project-facts.md / recurring-bugs.md / debugging-notes.md，也可按需自建任意主题文件）
- \`memory/daily/YYYY-MM-DD.md\`：每日笔记（当天日期）

**记忆就是普通文件，直接用通用文件工具读写**：
- 读：read filepath="memory/topics/user-profile.md", namespace="config"
- 改条目：edit（old_text 为原条目，new_text 为新条目；删除条目则 new_text 传空）
- 插条目：edit（old_text 为锚点行，new_text = 锚点行 + 新条目）
- 建新主题文件 / 新每日笔记：write
- 查重 / 检索：grep pattern="关键词", namespace="config", path="memory"

**记忆不是自动的，全靠你主动写入。**

### 必须主动写入记忆的时机（不要等用户要求，也不要等复盘任务）

1. **用户明确表达**：用户说"记住这个"、"以后都这样"、"别再..." → 立即写入，一次就记
2. **修复了 bug**：定位到根因并解决后 → 把「症状 + 根因 + 解决方案」写入 topics/recurring-bugs.md
3. **发现关键事实**：项目路径、架构约定、配置位置、账号规则、文件格式要求等 → topics/project-facts.md
4. **识别用户偏好**：用户对格式、工具、流程、语言的任何偏好表达（哪怕只出现一次）→ topics/user-profile.md
5. **被纠正时**：你根据记忆说错了某事、被用户纠正 → **必须立即用 edit 修正记忆源头**，否则下次还会犯同样的错

### 禁止写入

- 当前会话的临时状态（正在编辑哪个文件、中间结果、工具调用细节）
- 未经验证的猜测、只出现一次且不重要的细节
- 与现有条目重复的内容（写前先 grep 查重）

### 写入规则

- **先查后写**：用 grep（namespace="config", path="memory"）确认无重复；已有相关条目则用 edit 原地更新，绝不追加重复内容
- **索引与详情分离**：MEMORY.md 只放一行一条的浓缩索引；细节写入 topics/ 对应文件，索引中可注明来源文件
- **索引瘦身**：MEMORY.md 超过 ${MEMORY_INDEX_MAX_LINES} 行时，用 edit 删除过时条目或把低频内容下沉到 topics/
- **每日小结**：完成复杂任务后（生成了文件、解决了问题、做了决策），立即写入 memory/daily/当日日期.md 2-3 行小结（做了什么 + 关键决策 + 遗留问题）

### 为什么必须养成这个习惯

每日凌晨的复盘任务只能整理你平时写入的 daily 笔记和 topics 文件——**你不记，复盘就是空转**。写记忆的成本是一次工具调用，收益是下次会话直接站在经验之上。`;

/**
 * Context Builder - 构建中文系统提示词
 */
export class ContextBuilder {
  private skillManager = getSimpleSkillManager();
  private memoryStore = getMemoryStore();
  private toolManager = getToolManager();

  /**
   * 构建完整的系统提示词 (中文)
   */
  async buildSystemPrompt(options: ContextBuilderOptions = {}): Promise<string> {
    const sections: string[] = [];

    // 1. 核心身份
    sections.push(this._buildIdentitySection(options));

    // 2. 时间信息
    sections.push(this._buildTimeSection());

    // 3. Bootstrap 文件
    const bootstrapSection = await this._buildBootstrapSection(options);
    if (bootstrapSection) {
      sections.push(bootstrapSection);
    }

    // 4. 内存 (可选)
    if (options.includeMemory !== false) {
      const memorySection = await this._buildMemorySection(options);
      if (memorySection) {
        sections.push(memorySection);
      }
    }

    // 5. 技能
    const skillsSection = await this._buildSkillsSection(options);
    if (skillsSection) {
      sections.push(skillsSection);
    }

    // 6. 工具定义
    const toolsSection = await this._buildToolsSection(options);
    if (toolsSection) {
      sections.push(toolsSection);
    }

    return sections.filter(s => s).join('\n\n---\n\n');
  }

  /**
   * 1. 核心身份部分
   */
  private _buildIdentitySection(options: ContextBuilderOptions): string {
    // 获取工作区路径
    let workspaceInfo = '';
    if (options.workspacePath) {
      workspaceInfo = `\n\n## 当前工作目录\n\n工作目录路径：${options.workspacePath}\n- 创建文件时，filename 参数只需传文件名（如 report.docx），系统会自动解析到工作目录\n- 如果用户指定了其他路径，则使用完整路径`;
    }

    return `# 核心身份

你是一个强大的自主 AI Agent，名为"螺丝帽"，通过命令行工具执行任务。

## 核心能力
- 文件操作：读取、写入、编辑文件
- 目录管理：列出目录内容
- 定时任务：设置定时提醒和重复任务

## 工作原则
1. **主动思考**：理解用户意图，提出合适的问题
2. **工具选择**：根据任务选择最合适的工具
3. **结果验证**：确认任务完成，必要时提供预览
4. **友好交互**：使用简洁、友好的中文回复
5. **积极读取**：在执行任何没有被包含在tools中的操作时，你都需要提前读取各种文档才能开展具体行动。尤其对于各种skills都必须在阅读对应文档后才能执行相关操作。

## 工具执行原则（极其重要）
1. **持续执行**：调用工具获取信息后，必须继续调用工具执行实际操作，直到任务完全完成。绝不能在读取文档后停下来只做文字描述。
2. **行动优先**：不要花时间向用户描述你将要做什么，直接调用工具去做。用户需要的是最终结果，而不是你的工作计划。
3. **禁止中途停止**：如果用户给了明确指令，你应该一直调用工具直到产出最终结果（文件、报告等）。不要在中间步骤停下来等待确认。
4. **遇到问题继续**：如果某个工具调用失败，尝试其他方法继续完成任务，而不是停下来描述问题。

## 路径处理规则（极其重要）
1. **路径原样使用**：文件路径必须与用户提供的或工具返回的完全一致，禁止在路径中添加、删除或修改任何字符。
2. **禁止加空格**：特别注意不要在数字和中文之间插入空格。例如 "2026数字人" 绝不能写成 "2026 数字人"，"第1章" 绝不能写成 "第 1 章"。
3. **路径不加引号**：在工具参数中传递路径时，直接使用原始路径字符串，不需要额外添加引号或转义。${workspaceInfo}`;
  }

  /**
   * 2. 时间信息部分
   */
  private _buildTimeSection(): string {
    const now = new Date();
    const zhTime = now.toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });

    const weekday = now.toLocaleDateString('zh-CN', { weekday: 'long' });

    return `# 时间

当前时间: ${zhTime}
星期: ${weekday}`;
  }

  /**
   * 3. Bootstrap 文件部分
   */
  private async _buildBootstrapSection(options: ContextBuilderOptions): Promise<string | null> {
    if (!options.workspacePath) {
      return null;
    }

    const bootstrapPath = join(options.workspacePath, CONFIG_DIR_NAME);
    const sections: string[] = [];

    // 读取 IDENTITY.md
    const identityPath = join(bootstrapPath, BOOTSTRAP_FILES.IDENTITY);
    if (existsSync(identityPath)) {
      try {
        const content = await readFile(identityPath, 'utf-8');
        sections.push(`## 系统身份\n\n${content}`);
      } catch (e) {
        console.warn('[ContextBuilder] Failed to read IDENTITY.md:', e);
      }
    }

    // 读取 SOUL.md
    const soulPath = join(bootstrapPath, BOOTSTRAP_FILES.SOUL);
    if (existsSync(soulPath)) {
      try {
        const content = await readFile(soulPath, 'utf-8');
        sections.push(`## 个性化\n\n${content}`);
      } catch (e) {
        console.warn('[ContextBuilder] Failed to read SOUL.md:', e);
      }
    }

    // 读取 USER.md
    const userPath = join(bootstrapPath, BOOTSTRAP_FILES.USER);
    if (existsSync(userPath)) {
      try {
        const content = await readFile(userPath, 'utf-8');
        sections.push(`## 用户偏好\n\n${content}`);
      } catch (e) {
        console.warn('[ContextBuilder] Failed to read USER.md:', e);
      }
    }

    // 读取 TOOLS.md
    const toolsPath = join(bootstrapPath, BOOTSTRAP_FILES.TOOLS);
    if (existsSync(toolsPath)) {
      try {
        const content = await readFile(toolsPath, 'utf-8');
        sections.push(`## 工具指南\n\n${content}`);
      } catch (e) {
        console.warn('[ContextBuilder] Failed to read TOOLS.md:', e);
      }
    }

    if (sections.length === 0) {
      return null;
    }

    return `# Bootstrap 配置\n\n${sections.join('\n\n---\n\n')}`;
  }

  /**
   * 4. 内存部分
   *
   * 结构：
   *   0. 主动记忆规范（常驻行为指令，驱动 AI 主动写入记忆）
   *   1. MEMORY.md 索引（常驻，最多 4000 字符）
   *   2. 近 3 天 daily 笔记（最多 2000 字符，按日期倒序拼接）
   *   3. 今日笔记（最多 1000 字符；若已包含在近 3 天中则跳过重复）
   */
  private async _buildMemorySection(_options: ContextBuilderOptions): Promise<string | null> {
    try {
      const sections: string[] = [];

      // === 0. 主动记忆规范（无论是否已有记忆内容都必须注入，用于养成记忆习惯） ===
      sections.push(MEMORY_BEHAVIOR_RULES);

      // === 1. MEMORY.md 核心索引 ===
      const memoryIndexPath = join(getPathManager().getMemoryPath(), 'MEMORY.md');
      if (existsSync(memoryIndexPath)) {
        try {
          const indexContent = await readFile(memoryIndexPath, 'utf-8');
          const truncated = indexContent.length > 4000
            ? indexContent.slice(0, 4000) + '\n\n... (MEMORY.md 已截断，完整内容请用 read 读取，namespace="config")'
            : indexContent;
          sections.push(`## 核心记忆（常驻索引）\n\n${truncated}`);
        } catch (e) {
          console.warn('[ContextBuilder] Failed to read MEMORY.md:', e);
        }
      }

      // === 2. 近 3 天 daily 笔记 ===
      const dailyDir = join(getPathManager().getMemoryPath(), 'daily');
      const today = new Date();
      const dailyFiles: { date: string; content: string }[] = [];
      for (let i = 0; i < 3; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        const filePath = join(dailyDir, `${dateStr}.md`);
        if (existsSync(filePath)) {
          try {
            const content = await readFile(filePath, 'utf-8');
            dailyFiles.push({ date: dateStr, content });
          } catch {
            // 忽略读取错误
          }
        }
      }
      if (dailyFiles.length > 0) {
        // 拼接并硬截断到 2000 字符
        const joined = dailyFiles
          .map(f => `### ${f.date}\n\n${f.content}`)
          .join('\n\n---\n\n');
        const truncated = joined.length > 2000
          ? joined.slice(0, 2000) + '\n\n... (近期笔记已截断)'
          : joined;
        sections.push(`## 近期工作记忆（最近 3 天）\n\n${truncated}`);
      }

      // === 3. 今日笔记 ===
      // 若今日 daily 已在「近 3 天」中包含，则跳过避免重复
      if (!dailyFiles.some(f => f.date === today.toISOString().split('T')[0])) {
        const todayStr = today.toISOString().split('T')[0];
        const todayPath = join(dailyDir, `${todayStr}.md`);
        if (existsSync(todayPath)) {
          try {
            const todayContent = await readFile(todayPath, 'utf-8');
            const truncated = todayContent.length > 1000
              ? todayContent.slice(0, 1000) + '\n\n... (今日笔记已截断)'
              : todayContent;
            sections.push(`## 今日笔记\n\n${truncated}`);
          } catch {
            // 忽略
          }
        }
      }

      if (sections.length === 0) return null;
      return `# 内存\n\n${sections.join('\n\n---\n\n')}`;
    } catch (e) {
      console.warn('[ContextBuilder] Failed to build memory section:', e);
      return null;
    }
  }

  /**
   * 5. 技能部分（nanobot 风格）
   */
  private async _buildSkillsSection(_options: ContextBuilderOptions): Promise<string | null> {
    try {
      const parts: string[] = [];

      // 1. 始终加载 always skills（完整内容）
      const alwaysSkills = await this.skillManager.get_always_skills();
      const alwaysContent = await this.skillManager.load_skills_for_context(alwaysSkills);
      if (alwaysContent) {
        parts.push(alwaysContent);
      }

      // 2. 始终包含所有 skills 的摘要
      const skillsSummary = await this.skillManager.build_skills_summary();
      if (skillsSummary) {
        parts.push(skillsSummary);
      }

      if (parts.length === 0) {
        return null;
      }

      return `# 技能\n\n${parts.join('\n\n---\n\n')}`;
    } catch (e) {
      console.warn('[ContextBuilder] Failed to build skills section:', e);
      return null;
    }
  }

  /**
   * 6. 工具概览部分 (简洁列表)
   *
   * 注意：详细的工具定义通过 OpenAI Function Calling 的 tools 参数传递
   * 系统提示词中只保留工具概览，让大模型知道有哪些可用工具
   */
  private async _buildToolsSection(_options: ContextBuilderOptions): Promise<string | null> {
    try {
      // Get all available tools
      const tools = this.toolManager.getAllTools();

      if (tools.length === 0) {
        return null;
      }

      // Build simple tool overview (grouped by category)
      const toolGroups = new Map<string, string[]>();

      for (const tool of tools) {
        // Simple categorization based on tool name prefix
        let category = 'other';
        if (tool.name.startsWith('docx_') || tool.name.startsWith('word_')) {
          category = 'Word';
        } else if (tool.name.startsWith('xlsx_') || tool.name.startsWith('excel_')) {
          category = 'Excel';
        } else if (tool.name.startsWith('pptx_')) {
          category = 'PowerPoint';
        } else if (tool.name.startsWith('pdf_')) {
          category = 'PDF';
        } else if (tool.name.startsWith('batch_')) {
          category = '批量操作';
        } else if (tool.name.startsWith('get_') || tool.name.startsWith('list_') ||
                   tool.name.startsWith('read_') || tool.name.startsWith('search_') ||
                   tool.name === 'read' || tool.name === 'ls' ||
                   tool.name === 'write' || tool.name === 'edit') {
          category = '文件操作';
        } else if (tool.name.startsWith('get_template') || tool.name.startsWith('use_template') ||
                   tool.name.startsWith('add_template') || tool.name.startsWith('apply_prompt')) {
          category = '模板';
        } else if (tool.name.startsWith('cron_') || tool.name.startsWith('heartbeat_')) {
          category = '定时任务';
        } else if (tool.name.startsWith('kb_')) {
          category = '知识库';
        } else if (tool.name.startsWith('task_')) {
          category = '任务管理';
        }

        if (!toolGroups.has(category)) {
          toolGroups.set(category, []);
        }
        toolGroups.get(category)!.push(tool.name);
      }

      // Build overview sections
      const sections: string[] = [];

      // File operations first (most common)
      if (toolGroups.has('文件操作')) {
        const tools = toolGroups.get('文件操作')!;
        sections.push(`### 文件操作\n\n${tools.map(t => `- \`${t}\``).join('\n')}`);
      }

      // Then Office tools
      const officeCategories = ['Word', 'Excel', 'PowerPoint', 'PDF'];
      for (const cat of officeCategories) {
        if (toolGroups.has(cat)) {
          const tools = toolGroups.get(cat)!;
          sections.push(`### ${cat}\n\n${tools.map(t => `- \`${t}\``).join('\n')}`);
        }
      }

      // Other categories
      const otherCategories = ['批量操作', '模板', '定时任务', '知识库', '任务管理'];
      for (const cat of otherCategories) {
        if (toolGroups.has(cat)) {
          const tools = toolGroups.get(cat)!;
          sections.push(`### ${cat}\n\n${tools.map(t => `- \`${t}\``).join('\n')}`);
        }
      }

      // Remaining tools
      if (toolGroups.has('other')) {
        const tools = toolGroups.get('other')!;
        sections.push(`### 其他工具\n\n${tools.map(t => `- \`${t}\``).join('\n')}`);
      }

      return `# 可用工具\n\n你有以下工具可以使用。工具的详细定义和参数会在需要时提供。\n\n${sections.join('\n\n')}`;
    } catch (e) {
      console.warn('[ContextBuilder] Failed to build tools section:', e);
      return null;
    }
  }

  /**
   * Get Bootstrap file names
   */
  static getBootstrapFiles(): typeof BOOTSTRAP_FILES {
    return BOOTSTRAP_FILES;
  }

  /**
   * Estimate token count for a text
   */
  estimateTokens(text: string): number {
    // Rough estimate: 1 token ≈ 2 characters for Chinese, 4 characters for English
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const otherChars = text.length - chineseChars;
    return Math.ceil(chineseChars / 2 + otherChars / 4);
  }

  /**
   * Estimate total system prompt tokens
   */
  async estimateSystemPromptTokens(options: ContextBuilderOptions = {}): Promise<number> {
    const prompt = await this.buildSystemPrompt(options);
    return this.estimateTokens(prompt);
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let contextBuilderInstance: ContextBuilder | null = null;

/**
 * Get the singleton ContextBuilder instance
 */
export function getContextBuilder(): ContextBuilder {
  if (!contextBuilderInstance) {
    contextBuilderInstance = new ContextBuilder();
  }
  return contextBuilderInstance;
}

/**
 * Reset the singleton (useful for testing)
 */
export function resetContextBuilder(): void {
  contextBuilderInstance = null;
}

export default ContextBuilder;
