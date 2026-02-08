/**
 * Context Builder - nanobot style system prompt construction
 *
 * 基于 nanobot 的系统提示词构建器，实现完整的中文系统提示词生成
 *
 * 系统提示词结构：
 * 1. 核心身份 (中文)
 * 2. 时间信息 (中文)
 * 3. Bootstrap 文件 (IDENTITY.md, AGENTS.md, SOUL.md, USER.md, TOOLS.md)
 * 4. 内存 (长期记忆 + 今日笔记)
 * 5. 技能 (Always Skills 完整内容 + On-Demand Skills 摘要)
 * 6. Agent 提示词 (如果指定了 Agent)
 * 7. 工具定义 (JSON Schema)
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { getSimpleSkillManager } from './SimpleSkillManager';
import { getMemoryStore } from '../memory/MemoryStore';
import { getAgentManager } from '../agents/AgentManager';
import { getToolManager } from '../tools/ToolManager';

/**
 * Context Builder options
 */
export interface ContextBuilderOptions {
  /** Agent name (optional) */
  agentName?: string;
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
  AGENTS: 'AGENTS.md',
  SOUL: 'SOUL.md',
  USER: 'USER.md',
  TOOLS: 'TOOLS.md',
};

/**
 * Context Builder - 构建中文系统提示词
 */
export class ContextBuilder {
  private skillManager = getSimpleSkillManager();
  private memoryStore = getMemoryStore();
  private agentManager = getAgentManager();
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

    // 6. Agent 提示词 (如果指定)
    if (options.agentName) {
      const agentSection = await this._buildAgentSection(options.agentName);
      if (agentSection) {
        sections.push(agentSection);
      }
    }

    // 7. 工具定义
    const toolsSection = await this._buildToolsSection(options);
    if (toolsSection) {
      sections.push(toolsSection);
    }

    return sections.filter(s => s).join('\n\n---\n\n');
  }

  /**
   * 1. 核心身份部分
   */
  private _buildIdentitySection(_options: ContextBuilderOptions): string {
    return `# 核心身份

你是一个强大的自主 AI Agent，名为"螺丝钉"，运行在 Electron 环境中。

## 核心能力
- 文件操作：读取、写入、编辑文件
- 目录管理：列出目录内容、搜索文件
- 文档处理：Word、PowerPoint、Excel、PDF
- 批量操作：批量替换、批量创建
- 模板系统：使用模板快速生成文档
- 定时任务：设置定时提醒和重复任务

## 工作原则
1. **主动思考**：理解用户意图，提出合适的问题
2. **工具选择**：根据任务选择最合适的工具
3. **结果验证**：确认任务完成，必要时提供预览
4. **友好交互**：使用简洁、友好的中文回复`;
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

    const bootstrapPath = join(options.workspacePath, '.zero-employee');
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

    // 读取 AGENTS.md
    const agentsPath = join(bootstrapPath, BOOTSTRAP_FILES.AGENTS);
    if (existsSync(agentsPath)) {
      try {
        const content = await readFile(agentsPath, 'utf-8');
        sections.push(`## Agent 定义\n\n${content}`);
      } catch (e) {
        console.warn('[ContextBuilder] Failed to read AGENTS.md:', e);
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
   */
  private async _buildMemorySection(options: ContextBuilderOptions): Promise<string | null> {
    try {
      const context = await this.memoryStore.buildMemoryContext();

      if (!context || context.trim().length === 0) {
        return null;
      }

      // Apply token limit if specified
      const maxTokens = options.maxMemoryTokens || 2000;
      const estimatedTokens = context.length / 2; // Rough estimate: 2 chars ≈ 1 token

      if (estimatedTokens > maxTokens) {
        // Truncate with ellipsis
        const truncatedLength = Math.floor(maxTokens * 2);
        return `# 内存\n\n${context.slice(0, truncatedLength)}\n\n... (内容过长，已截断)`;
      }

      return `# 内存\n\n${context}`;
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
   * 6. Agent 提示词部分
   */
  private async _buildAgentSection(agentName: string): Promise<string | null> {
    try {
      const agent = this.agentManager.getAgent(agentName);
      if (!agent || !agent.systemPrompt) {
        return null;
      }

      return `# Agent: ${agentName}\n\n${agent.systemPrompt}`;
    } catch (e) {
      console.warn('[ContextBuilder] Failed to build agent section:', e);
      return null;
    }
  }

  /**
   * 7. 工具概览部分 (简洁列表)
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
                   tool.name === 'write_file' || tool.name === 'edit_file') {
          category = '文件操作';
        } else if (tool.name.startsWith('get_template') || tool.name.startsWith('use_template') ||
                   tool.name.startsWith('add_template') || tool.name.startsWith('apply_prompt')) {
          category = '模板';
        } else if (tool.name.startsWith('cron_') || tool.name.startsWith('heartbeat_')) {
          category = '定时任务';
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
      const otherCategories = ['批量操作', '模板', '定时任务'];
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
