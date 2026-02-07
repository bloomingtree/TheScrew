/**
 * Agent Manager - Manages agent definitions and permissions
 *
 * This module provides:
 * - Loading agent definitions from .md files
 * - Parsing YAML frontmatter
 * - Checking tool permissions
 * - Getting agent system prompts
 */

import fs from 'fs';
import path from 'path';

export interface AgentConfig {
  name: string;
  description: string;
  model?: string;
  tools: {
    allow?: string[];
    deny?: string[];
  };
  systemPrompt?: string;
}

/**
 * Simple YAML parser for Agent frontmatter
 */
class YamlParser {
  static parse(content: string): Record<string, any> {
    const result: Record<string, any> = {};
    const lines = content.split('\n');

    let currentKey: string | null = null;
    let isInArray = false;
    let arrayValues: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('#')) {
        if (isInArray && currentKey) {
          result[currentKey] = arrayValues;
          isInArray = false;
          arrayValues = [];
        }
        continue;
      }

      // Check for array items
      if (isInArray && trimmed.startsWith('-')) {
        arrayValues.push(trimmed.slice(1).trim());
        continue;
      }

      // If we were in an array, close it
      if (isInArray && currentKey) {
        result[currentKey] = arrayValues;
        isInArray = false;
        arrayValues = [];
      }

      // Check for key-value pair
      const colonIndex = trimmed.indexOf(':');
      if (colonIndex > 0) {
        currentKey = trimmed.slice(0, colonIndex).trim();
        const value = trimmed.slice(colonIndex + 1).trim();

        // Check if next lines might be array items
        if (!value && currentKey) {
          isInArray = true;
          arrayValues = [];
        } else {
          result[currentKey] = value;
        }
      }
    }

    // Close any open array
    if (isInArray && currentKey) {
      result[currentKey] = arrayValues;
    }

    return result;
  }
}

export class AgentManager {
  private agents: Map<string, AgentConfig> = new Map();
  private agentsDir: string;

  constructor(agentsDir?: string) {
    this.agentsDir = agentsDir || path.resolve(process.cwd(), '.zero-employee', 'agents');
  }

  /**
   * Load all agent definitions from .md files
   */
  async loadAllAgents(): Promise<void> {
    if (!fs.existsSync(this.agentsDir)) {
      fs.mkdirSync(this.agentsDir, { recursive: true });
      console.log('Agents directory created:', this.agentsDir);
      return;
    }

    const files = fs.readdirSync(this.agentsDir);
    for (const file of files) {
      if (file.endsWith('.md')) {
        await this.loadAgent(file);
      }
    }

    console.log('Agents loaded:', Array.from(this.agents.keys()));
  }

  /**
   * Load a single agent definition from a .md file
   */
  async loadAgent(filename: string): Promise<AgentConfig | null> {
    const filepath = path.join(this.agentsDir, filename);

    if (!fs.existsSync(filepath)) {
      console.warn('Agent file not found:', filepath);
      return null;
    }

    const content = fs.readFileSync(filepath, 'utf-8');

    // Parse YAML frontmatter (between --- markers)
    const frontmatterMatch = content.match(/^---\n([\s\S]+?)\n---/);
    if (!frontmatterMatch) {
      console.warn('No frontmatter found in:', filename);
      return null;
    }

    const yamlContent = frontmatterMatch[1];
    const yamlData = YamlParser.parse(yamlContent);

    // Extract system prompt (content after frontmatter)
    const systemPrompt = content.replace(/^---\n[\s\S]+?\n---\n/, '').trim();

    const config: AgentConfig = {
      name: yamlData['name'] || '',
      description: yamlData['description'] || '',
      model: yamlData['model'],
      tools: {
        allow: yamlData['tools']?.['allow'] || [],
        deny: yamlData['tools']?.['deny'] || []
      },
      systemPrompt
    };

    this.agents.set(config.name, config);
    console.log('Agent loaded:', config.name, '-', config.description);

    return config;
  }

  /**
   * Check if a tool is allowed for an agent
   */
  checkPermission(agentName: string, toolName: string): boolean {
    const agent = this.agents.get(agentName);

    // If no agent or agent not found, allow everything
    if (!agent) return true;

    const { deny, allow } = agent.tools;

    // Check blacklist first
    if (deny && deny.length > 0) {
      for (const pattern of deny) {
        if (this.matchPattern(toolName, pattern)) {
          console.log(`Tool "${toolName}" denied by agent "${agentName}" (pattern: ${pattern})`);
          return false;
        }
      }
    }

    // Check whitelist
    if (allow && allow.length > 0) {
      for (const pattern of allow) {
        if (this.matchPattern(toolName, pattern)) {
          console.log(`Tool "${toolName}" allowed by agent "${agentName}" (pattern: ${pattern})`);
          return true;
        }
      }
      // If whitelist exists but doesn't match, deny
      console.log(`Tool "${toolName}" denied by agent "${agentName}" (not in whitelist)`);
      return false;
    }

    // No restrictions, allow
    return true;
  }

  /**
   * Match tool name against a pattern (supports wildcards)
   */
  private matchPattern(toolName: string, pattern: string): boolean {
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      return toolName.startsWith(prefix);
    }
    return toolName === pattern;
  }

  /**
   * Get an agent configuration by name
   */
  getAgent(name: string): AgentConfig | undefined {
    return this.agents.get(name);
  }

  /**
   * Get all agents
   */
  getAllAgents(): AgentConfig[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get the system prompt for an agent
   */
  getSystemPrompt(agentName: string): string {
    const agent = this.agents.get(agentName);
    return agent?.systemPrompt || '';
  }

  /**
   * Get the model to use for an agent (if specified)
   */
  getModel(agentName: string): string | undefined {
    const agent = this.agents.get(agentName);
    return agent?.model;
  }
}

// Singleton instance
let agentManagerInstance: AgentManager | null = null;

/**
 * Get the singleton AgentManager instance
 */
export function getAgentManager(): AgentManager {
  if (!agentManagerInstance) {
    agentManagerInstance = new AgentManager();
  }
  return agentManagerInstance;
}

export default AgentManager;
