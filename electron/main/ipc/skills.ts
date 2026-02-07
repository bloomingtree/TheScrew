/**
 * Skills IPC Handlers
 *
 * IPC handlers for the skill system
 */

import { ipcMain } from 'electron';
import { getSkillManager } from '../core/SkillManager';

/**
 * Register skill-related IPC handlers
 */
export function registerSkillsHandlers(): void {
  const skillManager = getSkillManager();

  // Initialize skill manager
  ipcMain.handle('skills:initialize', async () => {
    try {
      await skillManager.initialize();
      return {
        success: true,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // Get all skill names
  ipcMain.handle('skills:getNames', async () => {
    try {
      const names = skillManager.getSkillNames();
      return {
        success: true,
        names,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // Get skill metadata
  ipcMain.handle('skills:getMeta', async (_event, name: string) => {
    try {
      const meta = skillManager.getSkillMeta(name);
      if (!meta) {
        return {
          success: false,
          error: `Skill ${name} not found`,
        };
      }
      return {
        success: true,
        meta,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // Get always skills
  ipcMain.handle('skills:getAlways', async () => {
    try {
      const skills = skillManager.getAlwaysSkills();
      return {
        success: true,
        skills,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // Get on-demand skills
  ipcMain.handle('skills:getOnDemand', async () => {
    try {
      const skills = skillManager.getOnDemandSkills();
      return {
        success: true,
        skills,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // Get on-demand skills summary
  ipcMain.handle('skills:getSummary', async () => {
    try {
      const summary = skillManager.getOnDemandSkillsSummary();
      return {
        success: true,
        summary,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // Load a skill by name
  ipcMain.handle('skills:load', async (_event, name: string) => {
    try {
      const skill = await skillManager.loadSkill(name);
      if (!skill) {
        return {
          success: false,
          error: `Skill ${name} not found`,
        };
      }
      return {
        success: true,
        skill,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // Detect required skills from message
  ipcMain.handle('skills:detect', async (_event, message: string) => {
    try {
      const required = skillManager.detectRequiredSkills(message);
      return {
        success: true,
        required,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // Build system prompt
  ipcMain.handle('skills:buildPrompt', async () => {
    try {
      const prompt = skillManager.buildSystemPrompt();
      return {
        success: true,
        prompt,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // Estimate token usage
  ipcMain.handle('skills:estimateTokens', async (_event, additionalSkills?: string[]) => {
    try {
      const tokens = skillManager.estimateActiveTokens(additionalSkills);
      return {
        success: true,
        tokens,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // Check if skill exists
  ipcMain.handle('skills:has', async (_event, name: string) => {
    try {
      const exists = skillManager.hasSkill(name);
      return {
        success: true,
        exists,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // Reload a skill (useful for development)
  ipcMain.handle('skills:reload', async (_event, name: string) => {
    try {
      const reloaded = await skillManager.reloadSkill(name);
      return {
        success: reloaded,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // Get skill statistics
  ipcMain.handle('skills:getStats', async () => {
    try {
      const stats = skillManager.getStats();
      return {
        success: true,
        stats,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  });

  console.log('[IPC] Skills handlers registered');
}
