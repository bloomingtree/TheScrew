import { readFile } from 'fs/promises';
import { join } from 'path';
import { Tool } from '../tools/ToolManager';
import { getPythonBridge } from '../ooxml/PythonBridge';

export interface OfficeSkill {
  name: string;
  description: string;
  category: 'xlsx' | 'docx' | 'pptx' | 'pdf';
  workflow: string;
  scripts: string[];
}

export interface SkillExecutionResult {
  success: boolean;
  output?: any;
  error?: string;
}

export class OfficeSkillManager {
  private skills: Map<string, OfficeSkill> = new Map();
  private skillsPath: string;
  private pythonBridge = getPythonBridge();

  constructor(skillsPath: string) {
    this.skillsPath = skillsPath;
  }

  /**
   * 加载所有 Office 技能
   */
  async loadAllSkills(): Promise<void> {
    const categories = ['xlsx', 'docx', 'pptx', 'pdf'];

    for (const category of categories) {
      await this.loadSkill(category);
    }
  }

  /**
   * 加载单个技能
   */
  async loadSkill(category: string): Promise<OfficeSkill | null> {
    const skillPath = join(this.skillsPath, category);
    const skillMdPath = join(skillPath, 'SKILL.md');

    try {
      const content = await readFile(skillMdPath, 'utf-8');
      const { frontmatter, body } = this.parseSkillMarkdown(content);

      const skill: OfficeSkill = {
        name: frontmatter.name || category,
        description: frontmatter.description || `${category.toUpperCase()} document operations`,
        category: category as any,
        workflow: body,
        scripts: await this.listScripts(skillPath)
      };

      this.skills.set(category, skill);
      console.log(`Loaded Office skill: ${category} - ${skill.description}`);
      return skill;
    } catch (error) {
      console.error(`Failed to load skill: ${category}`, error);
      return null;
    }
  }

  /**
   * 执行 Office Skill 脚本
   */
  async executeSkill(category: string, scriptName: string, args: Record<string, any> = {}): Promise<SkillExecutionResult> {
    try {
      const result = await this.pythonBridge.executeOfficeSkill(category, scriptName, args);
      return {
        success: true,
        output: result
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }

  /**
   * 解析 SKILL.md 文件
   */
  private parseSkillMarkdown(content: string): { frontmatter: Record<string, any>; body: string } {
    const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
    const match = content.match(frontmatterRegex);

    if (!match) {
      return { frontmatter: {}, body: content };
    }

    try {
      // 解析 YAML frontmatter
      const frontmatter: Record<string, any> = {};
      const lines = match[1].split('\n');

      for (const line of lines) {
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
          const key = line.slice(0, colonIndex).trim();
          let value = line.slice(colonIndex + 1).trim();

          // 移除引号
          if ((value.startsWith('"') && value.endsWith('"')) ||
              (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }

          frontmatter[key] = value;
        }
      }

      return { frontmatter, body: match[2].trim() };
    } catch {
      return { frontmatter: {}, body: content };
    }
  }

  /**
   * 列出技能脚本
   */
  private async listScripts(skillPath: string): Promise<string[]> {
    const { readdir } = await import('fs/promises');
    const scriptsDir = join(skillPath, 'scripts');

    try {
      const files = await readdir(scriptsDir);
      return files.filter(f => f.endsWith('.py') || f.endsWith('.js'));
    } catch {
      return [];
    }
  }

  /**
   * 获取技能
   */
  getSkill(category: string): OfficeSkill | undefined {
    return this.skills.get(category);
  }

  /**
   * 获取所有技能
   */
  getAllSkills(): OfficeSkill[] {
    return Array.from(this.skills.values());
  }

  /**
   * 检测消息中是否需要 Office 技能
   */
  detectRequiredSkills(message: string): string[] {
    const required: string[] = [];
    const lowerMessage = message.toLowerCase();

    // 关键词映射
    const keywords: Record<string, string[]> = {
      xlsx: ['excel', 'xlsx', '表格', '电子表格', 'spreadsheet', '财务', '工作簿', 'sheet', '公式'],
      docx: ['word', 'docx', '文档', 'word文档', '.doc'],
      pptx: ['pptx', 'powerpoint', '演示', '幻灯片', 'presentation', '.ppt'],
      pdf: ['pdf', 'pdf文档', '表单', 'adobe']
    };

    for (const [category, kw] of Object.entries(keywords)) {
      if (kw.some(k => lowerMessage.includes(k.toLowerCase()))) {
        if (!required.includes(category)) {
          required.push(category);
        }
      }
    }

    // 检测文件扩展名
    const extPattern = /\.\w{3,4}/gi;
    const matches = lowerMessage.match(extPattern) || [];

    for (const ext of matches) {
      if (ext === '.xlsx' && !required.includes('xlsx')) {
        required.push('xlsx');
      } else if ((ext === '.docx' || ext === '.doc') && !required.includes('docx')) {
        required.push('docx');
      } else if ((ext === '.pptx' || ext === '.ppt') && !required.includes('pptx')) {
        required.push('pptx');
      } else if (ext === '.pdf' && !required.includes('pdf')) {
        required.push('pdf');
      }
    }

    return required;
  }

  /**
   * 将技能转换为工具定义（基础版本，实际工具在 ToolManager 中定义）
   */
  getSkillTools(category: string): Tool[] {
    const skill = this.getSkill(category);
    if (!skill) {
      return [];
    }

    // 返回工具的占位符，实际工具在 ToolManager 中注册
    return [];
  }
}
