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
 * visibility: public
 * author: 作者名
 * version: 1.0.0
 * tags: [标签1, 标签2]
 * ---
 *
 * # 技能内容
 *
 * 这里是使用指南...
 */

import { readdir, readFile, stat, writeFile, mkdir } from 'fs/promises';
import { join, relative, resolve, basename } from 'path';
import { existsSync, readdirSync, statSync, readFileSync } from 'fs';
import { app } from 'electron';
import { createHash } from 'crypto';
import AdmZip from 'adm-zip';

/**
 * 获取应用根路径
 * - 开发环境: 项目根目录
 * - 生产环境: resources 目录或用户数据目录
 */
function getAppRootPath(): string {
  if (process.env.NODE_ENV === 'development') {
    return resolve(__dirname, '../..');
  }
  return process.resourcesPath || app.getPath('userData');
}

/**
 * 技能可见性
 */
export type SkillVisibility = 'public' | 'organization' | 'private';

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

  // 分享相关字段
  visibility?: SkillVisibility;   // 可见性：公开/组织内/私密
  author?: string;                // 作者
  version?: string;               // 版本号
  tags?: string[];                // 标签（便于搜索）
  createdAt?: number;             // 创建时间
  updatedAt?: number;             // 更新时间
}

/**
 * 技能包格式（用于导出/导入）
 */
export interface SkillPackage {
  format: 'zero-employee-skill';
  version: '1.0';
  skill: {
    meta: Omit<SkillMeta, 'path'>;  // 不包含 path，导入时重新生成
    content: string;                // SKILL.md 内容（移除 frontmatter）
  };
  dependencies?: {
    scripts?: Array<{               // 依赖的脚本文件
      name: string;
      content: string;              // base64 编码
    }>;
  };
  checksum?: string;                // SHA256 校验和
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
    let visibility: SkillVisibility = 'organization';  // 默认组织内可见
    let author: string | undefined;
    let version: string | undefined;
    let tags: string[] | undefined;

    if (frontmatterMatch) {
      try {
        const yaml = frontmatterMatch[1];
        const parsed = this.parseSimpleYaml(yaml);

        name = parsed.name || name;
        description = parsed.description || description;
        emoji = parsed.emoji || parsed.metadata?.emoji || '';
        keywords = parsed.keywords ? parsed.keywords.split(',').map((k: string) => k.trim()) :
                   (parsed.metadata?.keywords || []);
        if (parsed.mode === 'always') {
          mode = 'always';
        }

        // 解析新增字段
        if (parsed.visibility && ['public', 'organization', 'private'].includes(parsed.visibility)) {
          visibility = parsed.visibility as SkillVisibility;
        }
        author = parsed.author;
        version = parsed.version;
        if (parsed.tags) {
          if (Array.isArray(parsed.tags)) {
            tags = parsed.tags;
          } else if (typeof parsed.tags === 'string') {
            tags = parsed.tags.split(',').map((t: string) => t.trim());
          }
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
      visibility,
      author,
      version,
      tags,
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
   * 获取 config 目录结构（仅顶层，非递归）
   */
  private async get_config_structure(): Promise<string> {
    try {
      const configRoot = join(getAppRootPath(), '.zero-employee');
      if (!existsSync(configRoot)) {
        return '  (config 目录不存在)';
      }

      const entries = await readdir(configRoot, { withFileTypes: true });
      const items: string[] = [];

      for (const entry of entries) {
        if (entry.isDirectory()) {
          items.push(`  📁 ${entry.name}/`);
        } else if (entry.isFile()) {
          items.push(`  📄 ${entry.name}`);
        }
      }

      return items.length > 0 ? items.join('\n') : '  (空目录)';
    } catch (error) {
      return `  (无法读取: ${error})`;
    }
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

    // 获取 config 目录的实际结构
    const configStructure = await this.get_config_structure();

    return `## 可用技能

以下技能扩展了你的能力。使用技能时：
1. 使用 \`read_file\` 工具读取技能的 SKILL.md 文件，设置 \`namespace: "config"\`
   - 示例：\`read_file({ filepath: "skills/技能名/SKILL.md", namespace: "config" })\`
   - **注意**：返回结果包含 \`fullPath\`（绝对路径），可直接用于脚本执行
2. 需要时使用 \`list_directory\` 探索技能目录（如 scripts/*.py），同样设置 \`namespace: "config"\`
   - 示例：\`list_directory({ directory: "skills/技能名/scripts", namespace: "config" })\`
   - **注意**：返回结果包含 \`fullPath\`（绝对路径），可直接用于脚本执行
3. 阅读文档中的示例和说明后再执行操作

**文件路径说明**：
- 技能文件位于 \`.zero-employee/skills/\` 目录下
- 使用 \`namespace: "config"\` 参数访问配置目录下的文件
- \`filepath\` 或 \`directory\` 是相对于 \`.zero-employee/\` 根目录的路径
- **所有文件操作工具都返回 \`fullPath\`（绝对路径）**

**当前 config 目录结构**（.zero-employee/）：
${configStructure}

**脚本执行说明**：
- bash 工具的默认工作目录是用户的 **workspace**
- 执行技能脚本时使用 \`fullPath\`（绝对路径），不依赖当前工作目录
- 示例：\`bash({ command: "python E:/path/to/.zero-employee/skills/docx/scripts/accept_changes.py input.docx output.docx" })\`

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
   * 限制单个技能内容长度，防止请求体过大
   */
  async load_skills_for_context(skills: SkillMeta[]): Promise<string> {
    const sections: string[] = [];
    const MAX_SKILL_CONTENT_LENGTH = 5000; // 限制单个技能内容长度

    for (const skill of skills) {
      const fullSkill = await this.loadSkill(skill.name);
      if (fullSkill) {
        const emoji = skill.emoji ? `${skill.emoji} ` : '';
        let content = fullSkill.content;

        // 截断过长的技能内容
        if (content.length > MAX_SKILL_CONTENT_LENGTH) {
          console.warn(`[SimpleSkillManager] Skill "${skill.name}" content too large (${content.length} chars), truncating to ${MAX_SKILL_CONTENT_LENGTH}`);
          const relativePath = relative(this.workspaceSkillsDir, skill.path);
          const skillPath = `.zero-employee/skills/${relativePath}`;
          content = content.slice(0, MAX_SKILL_CONTENT_LENGTH) +
            `\n\n... (内容过长，已截断。使用 read_file 工具读取完整内容: filepath="${skillPath}", namespace="config")`;
        }

        sections.push(`## ${emoji}${skill.name}\n\n${content}`);
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

  /**
   * 格式化 YAML frontmatter
   */
  private formatFrontmatter(meta: SkillMeta): string {
    const lines = ['---'];

    lines.push(`name: ${meta.name}`);
    if (meta.description) lines.push(`description: ${meta.description}`);
    if (meta.emoji) lines.push(`emoji: ${meta.emoji}`);
    if (meta.keywords && meta.keywords.length > 0) {
      lines.push(`keywords: ${meta.keywords.join(',')}`);
    }
    if (meta.category) lines.push(`category: ${meta.category}`);
    if (meta.mode) lines.push(`mode: ${meta.mode}`);
    if (meta.visibility) lines.push(`visibility: ${meta.visibility}`);
    if (meta.author) lines.push(`author: ${meta.author}`);
    if (meta.version) lines.push(`version: ${meta.version}`);
    if (meta.tags && meta.tags.length > 0) {
      lines.push(`tags: [${meta.tags.map(t => `"${t}"`).join(', ')}]`);
    }

    lines.push('---');
    return lines.join('\n');
  }

  /**
   * 导出技能为 zip 包
   * zip 结构：
   * skill-name/
   *   SKILL.md
   *   scripts/
   *     ...
   */
  async exportSkillToZip(skillName: string): Promise<Buffer> {
    const skills = await this.listSkills();
    const skill = skills.find(s => s.name === skillName || s.category === skillName);
    if (!skill) {
      throw new Error(`Skill not found: ${skillName}`);
    }

    const skillDir = join(this.workspaceSkillsDir, skill.category || skillName);
    if (!existsSync(skillDir)) {
      throw new Error(`Skill directory not found: ${skillDir}`);
    }

    const zip = new AdmZip();

    // 递归添加目录中的所有文件
    const addDirectoryToZip = (dirPath: string, zipPath: string) => {
      const entries = readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dirPath, entry.name);
        const entryZipPath = join(zipPath, entry.name);

        if (entry.isDirectory()) {
          addDirectoryToZip(fullPath, entryZipPath);
        } else if (entry.isFile()) {
          const content = readFileSync(fullPath);
          zip.addFile(entryZipPath, content);
        }
      }
    };

    // 添加技能目录到 zip（根目录为技能名）
    addDirectoryToZip(skillDir, skill.category || skillName);

    console.log(`[SimpleSkillManager] Exported skill to zip: ${skillName}`);
    return zip.toBuffer();
  }

  /**
   * 导出技能为包（旧 JSON 格式，保留兼容）
   */
  async exportSkill(skillName: string): Promise<SkillPackage> {
    const skill = await this.loadSkill(skillName);
    if (!skill) {
      throw new Error(`Skill not found: ${skillName}`);
    }

    // 移除 path 字段，不需要在导出包中包含
    const { path, ...metaWithoutPath } = skill;

    const packageData: SkillPackage = {
      format: 'zero-employee-skill',
      version: '1.0',
      skill: {
        meta: metaWithoutPath,
        content: skill.content,
      },
    };

    // 计算校验和
    const content = JSON.stringify(packageData);
    packageData.checksum = createHash('sha256').update(content).digest('hex');

    console.log(`[SimpleSkillManager] Exported skill: ${skillName}`);
    return packageData;
  }

  /**
   * 从 zip 文件导入技能
   * 支持的 zip 结构：
   * skill-name/
   *   SKILL.md
   *   scripts/
   *     ...
   */
  async importSkillFromZip(buffer: Buffer): Promise<SkillMeta> {
    const zip = new AdmZip(buffer);
    const zipEntries = zip.getEntries();

    if (zipEntries.length === 0) {
      throw new Error('Empty zip file');
    }

    // 查找 SKILL.md 文件，确定技能名
    const skillMdEntry = zipEntries.find(e =>
      !e.isDirectory && e.entryName.endsWith('SKILL.md')
    );

    if (!skillMdEntry) {
      throw new Error('Invalid skill zip: SKILL.md not found');
    }

    // 提取技能名（zip 根目录名）
    const pathParts = skillMdEntry.entryName.split('/');
    const skillName = pathParts[0];

    if (!skillName) {
      throw new Error('Invalid skill zip: cannot determine skill name');
    }

    // 创建技能目录
    const skillDir = join(this.workspaceSkillsDir, skillName);
    await mkdir(skillDir, { recursive: true });

    // 解压所有文件到技能目录
    for (const entry of zipEntries) {
      if (entry.isDirectory) continue;

      // 去掉根目录前缀（skill-name/）
      const relativePath = entry.entryName.substring(skillName.length + 1);
      if (!relativePath) continue;

      const targetPath = join(skillDir, relativePath);
      const targetDir = join(targetPath, '..');

      // 确保目标目录存在
      if (!existsSync(targetDir)) {
        await mkdir(targetDir, { recursive: true });
      }

      // 写入文件
      const content = entry.getData();
      await writeFile(targetPath, content);
    }

    console.log(`[SimpleSkillManager] Imported skill from zip: ${skillName}`);

    // 解析并返回技能元数据
    const skillMdPath = join(skillDir, 'SKILL.md');
    return this.parseSkillMd(skillMdPath, skillName);
  }

  /**
   * 从文件导入技能（支持 .zip 和旧 .zes/.json 格式）
   */
  async importSkill(filePath: string): Promise<SkillMeta> {
    // 检测文件类型
    if (filePath.endsWith('.zip')) {
      const buffer = await readFile(filePath);
      return this.importSkillFromZip(buffer);
    }

    // 旧格式：JSON
    const content = await readFile(filePath, 'utf-8');
    return this.importSkillFromContent(content);
  }

  /**
   * 从 Buffer 导入技能（自动检测 zip 或 JSON 格式）
   */
  async importSkillFromBuffer(buffer: Buffer): Promise<SkillMeta> {
    // 尝试检测是否为 zip 文件（zip 文件以 PK 签名开头）
    const isZip = buffer.length >= 4 &&
      buffer[0] === 0x50 && buffer[1] === 0x4B; // 'PK'

    if (isZip) {
      return this.importSkillFromZip(buffer);
    }

    // 尝试作为 JSON 解析
    const content = buffer.toString('utf-8');
    return this.importSkillFromContent(content);
  }

  /**
   * 从内容导入技能（旧 JSON 格式，保留兼容）
   */
  async importSkillFromContent(content: string): Promise<SkillMeta> {
    let packageData: SkillPackage;

    try {
      packageData = JSON.parse(content);
    } catch (error) {
      throw new Error('Invalid skill file format');
    }

    // 验证格式
    if (packageData.format !== 'zero-employee-skill') {
      throw new Error('Invalid skill format');
    }

    // 验证校验和
    if (packageData.checksum) {
      const contentWithoutChecksum = JSON.stringify({
        ...packageData,
        checksum: undefined,
      });
      const computedChecksum = createHash('sha256').update(contentWithoutChecksum).digest('hex');
      if (computedChecksum !== packageData.checksum) {
        throw new Error('Skill checksum validation failed');
      }
    }

    // 保存技能到 .zero-employee/skills/
    const skillDir = join(this.workspaceSkillsDir, packageData.skill.meta.name);
    await mkdir(skillDir, { recursive: true });

    const skillMdPath = join(skillDir, 'SKILL.md');
    const frontmatter = this.formatFrontmatter({
      ...packageData.skill.meta,
      path: skillMdPath,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as SkillMeta);
    const skillContent = `${frontmatter}\n\n${packageData.skill.content}`;

    await writeFile(skillMdPath, skillContent, 'utf-8');

    console.log(`[SimpleSkillManager] Imported skill: ${packageData.skill.meta.name}`);

    // 返回导入后的技能元数据
    return {
      ...packageData.skill.meta,
      path: skillMdPath,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  /**
   * 删除技能
   */
  async deleteSkill(skillName: string): Promise<boolean> {
    const skills = await this.listSkills();
    const skill = skills.find(s => s.name === skillName);

    if (!skill) {
      return false;
    }

    try {
      // 删除整个技能目录
      const skillDir = join(this.workspaceSkillsDir, skillName);
      const { rm } = await import('fs/promises');
      await rm(skillDir, { recursive: true, force: true });

      console.log(`[SimpleSkillManager] Deleted skill: ${skillName}`);
      return true;
    } catch (error) {
      console.error(`[SimpleSkillManager] Failed to delete skill: ${skillName}`, error);
      return false;
    }
  }

  /**
   * 设置技能可见性
   */
  async setSkillVisibility(skillName: string, visibility: SkillVisibility): Promise<boolean> {
    const skills = await this.listSkills();
    const skill = skills.find(s => s.name === skillName);

    if (!skill) {
      return false;
    }

    try {
      // 读取现有内容
      const content = await readFile(skill.path, 'utf-8');

      // 替换 visibility 字段
      let newContent = content;
      const visibilityRegex = /^visibility:\s*\w+$/m;
      if (visibilityRegex.test(content)) {
        newContent = content.replace(visibilityRegex, `visibility: ${visibility}`);
      } else {
        // 在 mode 后面插入
        const modeRegex = /^(mode:\s*\w+)$/m;
        if (modeRegex.test(content)) {
          newContent = content.replace(modeRegex, `$1\nvisibility: ${visibility}`);
        } else {
          // 在 --- 后插入
          newContent = content.replace(/^---\n/, `---\nvisibility: ${visibility}\n`);
        }
      }

      await writeFile(skill.path, newContent, 'utf-8');
      console.log(`[SimpleSkillManager] Set skill visibility: ${skillName} -> ${visibility}`);
      return true;
    } catch (error) {
      console.error(`[SimpleSkillManager] Failed to set skill visibility: ${skillName}`, error);
      return false;
    }
  }

  /**
   * 获取可分享的技能列表（根据可见性过滤）
   */
  async getShareableSkills(): Promise<SkillMeta[]> {
    const allSkills = await this.listSkills();
    return allSkills.filter(s => s.visibility !== 'private');
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
    // Default to app root directory (where .zero-employee is located)
    simpleSkillManagerInstance = new SimpleSkillManager(getAppRootPath());
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
