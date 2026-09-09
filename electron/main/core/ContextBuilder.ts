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

你有跨会话的持久记忆，就是配置目录 memory/ 下的一组普通 markdown 文件（文件工具传 namespace="config"，用 read/edit/write/grep 直接操作）：
- \`memory/MEMORY.md\`：常驻索引（每次会话自动注入），一行一条浓缩摘要，超过 ${MEMORY_INDEX_MAX_LINES} 行时把低频条目下沉到 topics/
- \`memory/topics/*.md\`：主题文件（user-profile / project-facts / recurring-bugs / debugging-notes，可按需自建）
- \`memory/daily/YYYY-MM-DD.md\`：每日笔记

**记忆不是自动的，全靠你主动写入，不要等用户要求。** 以下时机立即写：
1. **用户表达偏好或纠正**（"记住这个"、"以后都这样"、你记错被纠正 → 用 edit 修正记忆源头）→ user-profile.md
2. **修复了 bug**：「症状+根因+解决方案」→ recurring-bugs.md
3. **发现关键事实**（路径、架构约定、配置位置、格式要求）→ project-facts.md；完成复杂任务后写当日 daily 笔记 2-3 行（做了什么+关键决策+遗留问题）

写入规则：先 grep 查重（path="memory"），已有条目用 edit 原地更新，绝不追加重复；索引只放一行摘要，细节写 topics/。禁止写入当前会话临时状态和未经验证的猜测。你不记，每日复盘就是空转——写记忆成本是一次工具调用，收益是下次会话直接站在经验之上。`;

/**
 * Context Builder - 构建中文系统提示词
 */
export class ContextBuilder {
  private skillManager = getSimpleSkillManager();
  private memoryStore = getMemoryStore();

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

    // 6. 工具定义已移除：完整 JSON Schema 通过 API tools 参数传递，
    //    在系统提示词里重复列举工具名是纯冗余

    return sections.filter(s => s).join('\n\n---\n\n');
  }

  /**
   * 1. 核心身份部分
   */
  private _buildIdentitySection(options: ContextBuilderOptions): string {
    // 运行环境：内嵌 Python 及其脚本目录（pdf/db/ssh 等技能依赖 bash 调用这些脚本）
    let envInfo = '';
    const pythonPath = getPathManager().getPythonPath();
    if (existsSync(pythonPath)) {
      const scriptsDir = getPathManager().getPythonScriptsPath();
      envInfo = `\n\n## 运行环境\n\nPython：\`${pythonPath}\`\n脚本目录：\`${scriptsDir}\`（含 pdf_process.py、db_query.py、ssh_exec.py、winrm_exec.py、pptx_design.py 等）\n\n技能文档中的 \`<python>\` / \`<scripts>\` 占位符即指上面两个完整路径（bash 调用时**必须用完整路径**，勿用裸 python 命令——系统 PATH 里的 Python 可能缺依赖）`;
    }

    // 获取工作区路径
    let workspaceInfo = '';
    if (options.workspacePath) {
      workspaceInfo = `\n\n## 当前工作目录\n\n工作目录路径：${options.workspacePath}\n- 创建文件时，filename 参数只需传文件名（如 report.docx），系统会自动解析到工作目录\n- 如果用户指定了其他路径，则使用完整路径`;
    }

    return `# 核心身份

你是一个强大的自主 AI Agent，名为"螺丝帽"，通过工具执行任务。使用简洁、友好的中文回复。

## 工作原则
1. **行动优先**：不要花时间描述计划，直接调用工具执行，直到产出最终结果（文件、报告等）；中间步骤不要停下来等确认。
2. **遇错换法**：工具调用失败时尝试其他方法继续，而不是停下来描述问题。
3. **先读后做**：执行 tools 覆盖范围之外的操作（尤其各种 skills）前，先读取对应文档再行动。

## 路径处理规则（极其重要）
1. **路径原样使用**：文件路径必须与用户提供的或工具返回的完全一致，禁止添加、删除或修改任何字符。
2. **禁止加空格**：不要在数字和中文之间插入空格。"2026数字人" 不能写成 "2026 数字人"，"第1章" 不能写成 "第 1 章"。
3. **路径不加引号**：工具参数中直接使用原始路径字符串。${workspaceInfo}${envInfo}`;
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
