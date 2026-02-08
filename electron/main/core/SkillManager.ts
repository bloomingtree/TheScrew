/**
 * Skill Manager - nanobot style progressive skill loading
 *
 * Responsibilities:
 * - Load skill metadata from SKILL.md files
 * - Distinguish between Always Skills and On-Demand Skills
 * - Build system prompt with progressive loading
 * - Auto-detect required skills from messages
 * - Estimate token usage for skills
 */

import { readFile, readdir, stat } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { ISkill, ISkillMeta } from './types';

/**
 * Skill file structure
 */
// interface SkillFile {
//   path: string;
//   category: string;
//   source: 'builtin' | 'workspace';
// }

/**
 * Skill Manager - progressive skill loading
 */
export class SkillManager {
  // Always loaded skills (full content in system prompt)
  private alwaysSkills: Map<string, ISkill> = new Map();

  // On-demand skills (summary only, loaded when needed)
  private onDemandSkills: Map<string, ISkillMeta> = new Map();

  // Skill file locations
  private skillsPaths: string[];

  // Workspace skills path (for hot reload)
  private workspaceSkillsPath?: string;

  // Cache for loaded skill content
  private skillContentCache: Map<string, ISkill> = new Map();

  constructor(skillsPaths: string[]) {
    this.skillsPaths = skillsPaths;
    // Track workspace path separately
    this.workspaceSkillsPath = skillsPaths.find(p => p.includes('.zero-employee'));
    console.log('[SkillManager] Initialized with paths:', skillsPaths);
  }

  /**
   * Initialize - load all skill metadata
   */
  async initialize(): Promise<void> {
    console.log('[SkillManager] Loading skills...');

    for (const skillsPath of this.skillsPaths) {
      if (existsSync(skillsPath)) {
        await this.loadSkillsFromPath(skillsPath, 'builtin');
      } else {
        console.log(`[SkillManager] Skills path does not exist: ${skillsPath}`);
      }
    }

    console.log(`[SkillManager] Loaded ${this.alwaysSkills.size} always skills, ${this.onDemandSkills.size} on-demand skills`);
  }

  /**
   * Load skills from a directory path
   */
  private async loadSkillsFromPath(basePath: string, source: 'builtin' | 'workspace'): Promise<void> {
    try {
      const categories = await readdir(basePath);

      for (const category of categories) {
        const categoryPath = join(basePath, category);

        // Skip if not exists
        if (!existsSync(categoryPath)) {
          continue;
        }

        // Check if it's a directory
        try {
          const stats = await stat(categoryPath);
          if (!stats.isDirectory()) {
            continue;
          }
        } catch {
          continue;
        }

        // Look for SKILL.md
        const skillMdPath = join(categoryPath, 'SKILL.md');
        if (!existsSync(skillMdPath)) {
          continue;
        }

        try {
          const content = await readFile(skillMdPath, 'utf-8');
          const skill = this.parseSkillFile(content, category, skillMdPath, source);

          if (skill.meta.mode === 'always') {
            this.alwaysSkills.set(category, skill);
            console.log(`[SkillManager] Loaded always skill: ${category}`);
          } else {
            this.onDemandSkills.set(category, skill.meta);
            console.log(`[SkillManager] Loaded on-demand skill: ${category}`);
          }

          // Cache the skill content
          this.skillContentCache.set(category, skill);
        } catch (error) {
          console.error(`[SkillManager] Failed to load skill: ${category}`, error);
        }
      }
    } catch (error) {
      console.error(`[SkillManager] Failed to load skills from: ${basePath}`, error);
    }
  }

  /**
   * Parse SKILL.md file with YAML frontmatter
   */
  private parseSkillFile(content: string, category: string, path: string, _source: 'builtin' | 'workspace'): ISkill {
    // Default metadata
    const meta: ISkillMeta = {
      name: category,
      category,
      description: `${category.toUpperCase()} operations`,
      mode: 'on-demand',
      estimatedTokens: 500,
      keywords: this.generateDefaultKeywords(category),
      path,
    };

    let body = content;

    // Parse YAML frontmatter (between --- markers)
    const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
    const match = content.match(frontmatterRegex);

    if (match) {
      const yamlContent = match[1];
      body = match[2];

      // Parse YAML content
      const parsed = this.parseYamlFrontmatter(yamlContent, category, path);
      Object.assign(meta, parsed);
    }

    // Extract related tool names from content
    const tools = this.extractToolNames(body);

    // Re-estimate tokens based on content length
    if (meta.estimatedTokens === 500) {
      meta.estimatedTokens = Math.ceil(body.length / 4);
    }

    return { meta, content: body, tools };
  }

  /**
   * Parse YAML frontmatter
   */
  private parseYamlFrontmatter(yaml: string, category: string, _path: string): Partial<ISkillMeta> {
    const result: any = {};
    const lines = yaml.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      const colonIndex = trimmed.indexOf(':');
      if (colonIndex > 0) {
        const key = trimmed.slice(0, colonIndex).trim();
        let value = trimmed.slice(colonIndex + 1).trim();

        // Remove quotes
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }

        result[key] = value;
      }
    }

    // Map to ISkillMeta
    const meta: Partial<ISkillMeta> = {
      name: result.name || category,
      category: result.category || category,
      description: result.description || `${category} operations`,
      mode: result.mode === 'always' ? 'always' : 'on-demand',
      estimatedTokens: parseInt(result.estimatedTokens) || undefined,
    };

    // Parse keywords
    if (result.keywords) {
      if (typeof result.keywords === 'string') {
        meta.keywords = result.keywords.split(',').map((k: string) => k.trim());
      } else if (Array.isArray(result.keywords)) {
        meta.keywords = result.keywords;
      }
    }

    // Parse tools
    if (result.tools) {
      if (typeof result.tools === 'string') {
        meta.tools = result.tools.split(',').map((t: string) => t.trim());
      } else if (Array.isArray(result.tools)) {
        meta.tools = result.tools;
      }
    }

    // Parse requires
    if (result.requires) {
      if (typeof result.requires === 'object') {
        if (result.requires.bins && Array.isArray(result.requires.bins)) {
          meta.requiresBins = result.requires.bins;
        }
        if (result.requires.env && Array.isArray(result.requires.env)) {
          meta.requiresEnv = result.requires.env;
        }
      }
    }

    return meta;
  }

  /**
   * Generate default keywords for a category
   */
  private generateDefaultKeywords(category: string): string[] {
    const keywordMap: Record<string, string[]> = {
      docx: ['word', 'docx', 'document', '文档', '.doc', 'ms word'],
      pptx: ['powerpoint', 'pptx', 'ppt', 'presentation', 'slides', '演示', '幻灯片'],
      xlsx: ['excel', 'xlsx', 'xls', 'spreadsheet', 'sheet', '表格', '工作簿'],
      pdf: ['pdf', 'acrobat', 'form', '表单'],
      batch: ['batch', 'bulk', 'multiple', '批量', 'multiple files'],
      template: ['template', 'templating', '模板'],
      ooxml: ['ooxml', 'validate', 'validation', 'repair', '验证', '修复'],
    };

    return keywordMap[category] || [category];
  }

  /**
   * Extract tool names from skill content
   */
  private extractToolNames(content: string): string[] {
    const toolNames = new Set<string>();

    // Look for code blocks with tool calls
    const codeBlockRegex = /```(?:bash|javascript|typescript|python)\n([\s\S]*?)```/g;
    let match;

    while ((match = codeBlockRegex.exec(content)) !== null) {
      const code = match[1];

      // Find function calls (snake_case typically indicates tools)
      const functionCallRegex = /(\w+)\s*\(/g;
      let funcMatch;

      while ((funcMatch = functionCallRegex.exec(code)) !== null) {
        const name = funcMatch[1];
        // Filter for likely tool names (lowercase, longer than 3 chars)
        if (name.length > 3 && name === name.toLowerCase()) {
          toolNames.add(name);
        }
      }
    }

    return Array.from(toolNames);
  }

  /**
   * Get all Always Skills
   */
  getAlwaysSkills(): ISkill[] {
    return Array.from(this.alwaysSkills.values());
  }

  /**
   * Get Always Skills by category
   */
  getAlwaysSkill(category: string): ISkill | undefined {
    return this.alwaysSkills.get(category);
  }

  /**
   * Get all On-Demand Skills metadata
   */
  getOnDemandSkills(): ISkillMeta[] {
    return Array.from(this.onDemandSkills.values());
  }

  /**
   * Get On-Demand Skill metadata
   */
  getOnDemandSkill(category: string): ISkillMeta | undefined {
    return this.onDemandSkills.get(category);
  }

  /**
   * Get summary of On-Demand Skills
   */
  getOnDemandSkillsSummary(): string {
    const skills = this.getOnDemandSkills();

    if (skills.length === 0) {
      return 'No additional skills available.';
    }

    return skills.map(skill => {
      const keywords = skill.keywords.length > 0
        ? ` (keywords: ${skill.keywords.join(', ')})`
        : '';

      return `- **${skill.name}**: ${skill.description}${keywords}`;
    }).join('\n');
  }

  /**
   * Load a skill by name (full content)
   */
  async loadSkill(name: string): Promise<ISkill | null> {
    // Check always skills first
    if (this.alwaysSkills.has(name)) {
      return this.alwaysSkills.get(name)!;
    }

    // Check cache
    if (this.skillContentCache.has(name)) {
      return this.skillContentCache.get(name)!;
    }

    // Load on-demand skill
    const meta = this.onDemandSkills.get(name);
    if (!meta) {
      return null;
    }

    try {
      const content = await readFile(meta.path, 'utf-8');
      const skill = this.parseSkillFile(content, name, meta.path, 'builtin');
      this.skillContentCache.set(name, skill);
      return skill;
    } catch (error) {
      console.error(`[SkillManager] Failed to load skill: ${name}`, error);
      return null;
    }
  }

  /**
   * Build system prompt - nanobot style progressive loading
   */
  buildSystemPrompt(): string {
    const parts: string[] = [];

    // Always skills: full content
    const alwaysSkills = this.getAlwaysSkills();
    if (alwaysSkills.length > 0) {
      const alwaysContent = alwaysSkills
        .map(skill => `## ${skill.meta.name}\n\n${skill.content}`)
        .join('\n\n---\n\n');

      parts.push(`# Active Skills\n\n${alwaysContent}`);
    }

    // On-demand skills: summary only
    const onDemandSummary = this.getOnDemandSkillsSummary();
    if (onDemandSummary && !onDemandSummary.includes('No additional skills')) {
      parts.push(`# Available Skills\n\nThe following skills extend your capabilities. To use a skill, ask for it by name or describe what you need.\n\n${onDemandSummary}`);
    }

    return parts.join('\n\n---\n\n');
  }

  /**
   * Detect required skills from a message
   */
  detectRequiredSkills(message: string): string[] {
    const lowerMessage = message.toLowerCase();
    const required: string[] = [];

    // Check all skills (always + on-demand) for keyword matches
    const allSkills = [
      ...Array.from(this.alwaysSkills.values()).map(s => s.meta),
      ...Array.from(this.onDemandSkills.values()),
    ];

    for (const skill of allSkills) {
      // Skip if already in required
      if (required.includes(skill.name)) {
        continue;
      }

      // Check keyword matches
      for (const keyword of skill.keywords) {
        if (lowerMessage.includes(keyword.toLowerCase())) {
          required.push(skill.name);
          break;
        }
      }
    }

    // Check file extensions
    const extPattern = /\.\w{3,4}\b/gi;
    const matches = lowerMessage.match(extPattern) || [];

    const extToSkill: Record<string, string> = {
      '.docx': 'docx',
      '.doc': 'docx',
      '.pptx': 'pptx',
      '.ppt': 'pptx',
      '.xlsx': 'xlsx',
      '.xls': 'xlsx',
      '.pdf': 'pdf',
    };

    for (const ext of matches) {
      const skill = extToSkill[ext.toLowerCase()];
      if (skill && !required.includes(skill)) {
        required.push(skill);
      }
    }

    // Filter out always skills (they're already loaded)
    const alwaysSkillNames = Array.from(this.alwaysSkills.keys());
    return required.filter(name => !alwaysSkillNames.includes(name));
  }

  /**
   * Estimate token usage for active skills
   */
  estimateActiveTokens(additionalSkills?: string[]): number {
    let total = 0;

    // Always skills
    for (const skill of this.alwaysSkills.values()) {
      total += skill.meta.estimatedTokens;
    }

    // Additional skills
    if (additionalSkills) {
      for (const name of additionalSkills) {
        const skill = this.alwaysSkills.get(name);
        const skillMeta = this.onDemandSkills.get(name);
        if (skill) {
          total += skill.meta.estimatedTokens;
        } else if (skillMeta) {
          total += skillMeta.estimatedTokens;
        }
      }
    }

    return total;
  }

  /**
   * Check if a skill is available
   */
  hasSkill(name: string): boolean {
    return this.alwaysSkills.has(name) || this.onDemandSkills.has(name);
  }

  /**
   * Get all available skill names
   */
  getSkillNames(): string[] {
    return [
      ...Array.from(this.alwaysSkills.keys()),
      ...Array.from(this.onDemandSkills.keys()),
    ];
  }

  /**
   * Get skill metadata
   */
  getSkillMeta(name: string): ISkillMeta | undefined {
    if (this.alwaysSkills.has(name)) {
      return this.alwaysSkills.get(name)!.meta;
    }
    return this.onDemandSkills.get(name);
  }

  /**
   * Reload a skill (useful for development)
   */
  async reloadSkill(name: string): Promise<boolean> {
    const meta = this.getSkillMeta(name);
    if (!meta) {
      return false;
    }

    try {
      const content = await readFile(meta.path, 'utf-8');
      const skill = this.parseSkillFile(content, name, meta.path, 'builtin');

      // Update cache
      this.skillContentCache.set(name, skill);

      // Update appropriate map
      if (skill.meta.mode === 'always') {
        this.alwaysSkills.set(name, skill);
      } else {
        this.onDemandSkills.set(name, skill.meta);
      }

      console.log(`[SkillManager] Reloaded skill: ${name}`);
      return true;
    } catch (error) {
      console.error(`[SkillManager] Failed to reload skill: ${name}`, error);
      return false;
    }
  }

  /**
   * Clear all skills (useful for testing)
   */
  clear(): void {
    this.alwaysSkills.clear();
    this.onDemandSkills.clear();
    this.skillContentCache.clear();
    console.log('[SkillManager] Cleared all skills');
  }

  /**
   * Get statistics
   */
  getStats(): {
    alwaysSkillsCount: number;
    onDemandSkillsCount: number;
    totalEstimatedTokens: number;
    skillNames: string[];
  } {
    return {
      alwaysSkillsCount: this.alwaysSkills.size,
      onDemandSkillsCount: this.onDemandSkills.size,
      totalEstimatedTokens: this.estimateActiveTokens(),
      skillNames: this.getSkillNames(),
    };
  }

  /**
   * Reload workspace skills - hot reload for development
   * Clears and reloads all skills from the workspace path
   */
  async reloadWorkspaceSkills(): Promise<{
    success: boolean;
    alwaysCount: number;
    onDemandCount: number;
    error?: string;
  }> {
    if (!this.workspaceSkillsPath) {
      return {
        success: false,
        alwaysCount: 0,
        onDemandCount: 0,
        error: 'No workspace skills path configured',
      };
    }

    try {
      // Clear existing workspace skills
      for (const [name, skill] of this.alwaysSkills) {
        if (skill.meta.path.includes(this.workspaceSkillsPath!)) {
          this.alwaysSkills.delete(name);
        }
      }
      for (const [name, meta] of this.onDemandSkills) {
        if (meta.path.includes(this.workspaceSkillsPath!)) {
          this.onDemandSkills.delete(name);
        }
      }

      // Reload from workspace path
      await this.loadSkillsFromPath(this.workspaceSkillsPath, 'workspace');

      return {
        success: true,
        alwaysCount: this.alwaysSkills.size,
        onDemandCount: this.onDemandSkills.size,
      };
    } catch (error: any) {
      return {
        success: false,
        alwaysCount: 0,
        onDemandCount: 0,
        error: error.message,
      };
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let skillManagerInstance: SkillManager | null = null;

/**
 * Get the singleton SkillManager instance
 *
 * Note: Only loads from workspace skills directory (.zero-employee/skills/)
 * Built-in office skills have been removed to align with nanobot's simplified specification.
 */
export function getSkillManager(): SkillManager {
  if (!skillManagerInstance) {
    // Only load from workspace skills directory
    const workspacePath = require('path').resolve(process.cwd(), '.zero-employee', 'skills');

    skillManagerInstance = new SkillManager([workspacePath]);
  }
  return skillManagerInstance;
}

/**
 * Reset the singleton (useful for testing)
 */
export function resetSkillManager(): void {
  if (skillManagerInstance) {
    skillManagerInstance.clear();
  }
  skillManagerInstance = null;
}

export default SkillManager;
