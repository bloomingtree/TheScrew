/**
 * SimpleSkillManager - nanobot-style skill loader
 *
 * 基于 nanobot 的极简设计理念：
 * - Skills = 纯 Markdown 文档 (SKILL.md)
 * - Tools = 可执行代码
 * - 即插即用：放入 .md 文件即可
 *
 * 技能结构：
 * skills/
 * └── skill-name/
 *     └── SKILL.md  ← 仅此一个文件！
 *
 * SKILL.md 格式：
 * ---
 * name: skill-name
 * description: 技能描述
 * emoji: 🎯
 * keywords: keyword1,keyword2
 * ---
 *
 * # 技能内容
 *
 * 这里是使用指南...
 */

import { readdir, readFile, stat } from 'fs/promises';
import { join, relative } from 'path';
import { existsSync } from 'fs';

/**
 * 技能元数据
 */
export interface SkillMeta {
  name: string;
  description: string;
  emoji?: string;
  keywords?: string[];
  category?: string;
  path: string;
  mode?: 'always' | 'on-demand';  // nanobot: always 表示始终完整加载
}

/**
 * 完整技能（包含内容）
 */
export interface Skill extends SkillMeta {
  content: string;
}

/**
 * SimpleSkillManager - 极简技能管理器
 *
 * Note: Built-in office skills have been removed. Only loads from workspace skills directory.
 */
export class SimpleSkillManager {
  private workspaceSkillsDir: string;

  constructor(workspacePath: string) {
    this.workspaceSkillsDir = join(workspacePath, '.zero-employee', 'skills');
    console.log('[SimpleSkillManager] Initialized with:', {
      workspace: this.workspaceSkillsDir,
    });
  }

  /**
   * 列出所有可用技能
   */
  async listSkills(): Promise<SkillMeta[]> {
    // Only scan workspace skills
    return await this.scanDirectory(this.workspaceSkillsDir);
  }

  /**
   * 扫描目录中的技能
   */
  private async scanDirectory(basePath: string): Promise<SkillMeta[]> {
    const skills: SkillMeta[] = [];

    if (!existsSync(basePath)) {
      return skills;
    }

    try {
      const categories = await readdir(basePath);

      for (const category of categories) {
        const categoryPath = join(basePath, category);

        // 跳过非目录
        try {
          const stats = await stat(categoryPath);
          if (!stats.isDirectory()) {
            continue;
          }
        } catch {
          continue;
        }

        // 查找 SKILL.md
        const skillMdPath = join(categoryPath, 'SKILL.md');
        if (existsSync(skillMdPath)) {
          const meta = await this.parseSkillMd(skillMdPath, category);
          skills.push(meta);
        }
      }
    } catch (error) {
      console.warn(`[SimpleSkillManager] Failed to scan directory: ${basePath}`, error);
    }

    return skills;
  }

  /**
   * 解析 SKILL.md 文件
   */
  private async parseSkillMd(path: string, category: string): Promise<SkillMeta> {
    const content = await readFile(path, 'utf-8');

    // 解析 YAML frontmatter（简单的正则解析）
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);

    let name = category;
    let description = '';
    let emoji = '';
    let keywords: string[] = [];
    let mode: 'always' | 'on-demand' = 'on-demand';  // 默认 on-demand

    if (frontmatterMatch) {
      try {
        const yaml = frontmatterMatch[1];
        const parsed = this.parseSimpleYaml(yaml);

        name = parsed.name || name;
        description = parsed.description || description;
        emoji = parsed.emoji || parsed.metadata?.emoji || '';
        keywords = parsed.keywords || parsed.metadata?.keywords || [];

        // 解析 mode 字段
        const parsedMode = parsed.mode || parsed.metadata?.mode;
        if (parsedMode === 'always') {
          mode = 'always';
        }
      } catch (error) {
        console.warn(`[SimpleSkillManager] Failed to parse YAML in: ${path}`, error);
      }
    }

    return {
      name,
      description,
      emoji,
      keywords,
      category,
      path,
      mode,
    };
  }

  /**
   * 简单的 YAML 解析器（仅支持基本的 key: value 格式）
   */
  private parseSimpleYaml(yaml: string): Record<string, any> {
    const result: Record<string, any> = {};
    const lines = yaml.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();

      // 跳过空行和注释
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      const colonIndex = trimmed.indexOf(':');
      if (colonIndex > 0) {
        const key = trimmed.slice(0, colonIndex).trim();
        let value = trimmed.slice(colonIndex + 1).trim();

        // 移除引号
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }

        result[key] = value;
      }
    }

    return result;
  }

  /**
   * 加载完整技能内容
   */
  async loadSkill(name: string): Promise<Skill | null> {
    const skills = await this.listSkills();
    const meta = skills.find(s => s.name === name);

    if (!meta) {
      return null;
    }

    const content = await readFile(meta.path, 'utf-8');

    // 移除 YAML frontmatter，只保留内容
    const contentOnly = content.replace(/^---\n[\s\S]*?\n---\n/, '');

    return {
      ...meta,
      content: contentOnly.trim(),
    };
  }

  /**
   * 构建技能摘要（用于系统提示词）
   * nanobot 风格：不接受参数，始终返回所有 skills 的摘要
   * 包含文件路径，让 agent 可以通过 read_file 工具读取完整内容
   */
  async build_skills_summary(): Promise<string> {
    const skills = await this.listSkills();
    const sections: string[] = [];

    for (const skill of skills) {
      const emoji = skill.emoji ? `${skill.emoji} ` : '';
      // 计算相对于 .zero-employee/skills 的路径
      const relativePath = relative(this.workspaceSkillsDir, skill.path);
      const skillPath = `.zero-employee/skills/${relativePath}`;
      const skillDir = `.zero-employee/skills/${skill.category}`;

      sections.push(
        `### ${emoji}${skill.name}\n\n${skill.description}\n\n**SKILL.md**: \`${skillPath}\`\n**技能目录**: \`${skillDir}/\``
      );
    }

    if (sections.length === 0) {
      return '';
    }

    return `## 可用技能

以下技能扩展了你的能力。使用技能时：
1. 使用 \`read_skill\` 工具读取技能的 SKILL.md 文件
2. 需要时使用 \`list_skill_directory\` 探索技能目录（如 scripts/*.py）
3. 阅读文档中的示例和说明后再执行操作

**Python 脚本执行**：
当 SKILL.md 文档中包含 \`python scripts/xxx.py\` 命令时：
- 使用 \`exec_python_script\` 工具执行脚本
- 参数：\`{ skillName: "技能名", scriptPath: "scripts/xxx.py", args: ["参数1", "参数2"] }\`
- 示例：\`exec_python_script({ skillName: "docx", scriptPath: "scripts/accept_changes.py", args: ["input.docx", "output.docx"] })\`

你有以下技能可用：

${sections.join('\n\n')}`;
  }

  /**
   * 获取所有 always: true 的 skills（nanobot 风格）
   */
  async get_always_skills(): Promise<SkillMeta[]> {
    const skills = await this.listSkills();
    return skills.filter(s => s.mode === 'always');
  }

  /**
   * 加载指定 skills 的完整内容（nanobot 风格）
   * 用于系统提示词中 always skills 的完整加载
   */
  async load_skills_for_context(skills: SkillMeta[]): Promise<string> {
    const sections: string[] = [];

    for (const skill of skills) {
      const fullSkill = await this.loadSkill(skill.name);
      if (fullSkill) {
        const emoji = skill.emoji ? `${skill.emoji} ` : '';
        sections.push(`## ${emoji}${skill.name}\n\n${fullSkill.content}`);
      }
    }

    if (sections.length === 0) {
      return '';
    }

    return `## 已启用技能\n\n${sections.join('\n\n---\n\n')}`;
  }

  /**
   * 重载工作区技能（开发时热重载）
   */
  async reloadWorkspaceSkills(): Promise<{ success: boolean; count: number }> {
    try {
      const skills = await this.scanDirectory(this.workspaceSkillsDir);
      console.log(`[SimpleSkillManager] Reloaded ${skills.length} workspace skills`);
      return { success: true, count: skills.length };
    } catch (error: any) {
      return { success: false, count: 0 };
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let simpleSkillManagerInstance: SimpleSkillManager | null = null;

/**
 * Get the singleton SimpleSkillManager instance
 */
export function getSimpleSkillManager(): SimpleSkillManager {
  if (!simpleSkillManagerInstance) {
    // Default to current working directory
    simpleSkillManagerInstance = new SimpleSkillManager(process.cwd());
  }
  return simpleSkillManagerInstance;
}

/**
 * Set the SimpleSkillManager instance with a specific workspace
 */
export function setSimpleSkillManager(workspacePath: string): SimpleSkillManager {
  simpleSkillManagerInstance = new SimpleSkillManager(workspacePath);
  return simpleSkillManagerInstance;
}

/**
 * Reset the singleton (useful for testing)
 */
export function resetSimpleSkillManager(): void {
  simpleSkillManagerInstance = null;
}

export default SimpleSkillManager;
