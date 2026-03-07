/**
 * Skills Store - 技能状态管理
 *
 * 使用 Zustand 管理技能的导入、导出、删除等状态
 */

import { create } from 'zustand';

export type SkillVisibility = 'public' | 'organization' | 'private';

export interface SkillMeta {
  name: string;
  description: string;
  emoji?: string;
  keywords?: string[];
  category?: string;
  path: string;
  mode?: 'always' | 'on-demand';
  visibility?: SkillVisibility;
  author?: string;
  version?: string;
  tags?: string[];
  createdAt?: number;
  updatedAt?: number;
}

export interface SkillPackage {
  format: 'zero-employee-skill';
  version: '1.0';
  skill: {
    meta: Omit<SkillMeta, 'path'>;
    content: string;
  };
  checksum?: string;
}

interface SkillsState {
  // 技能列表
  skills: SkillMeta[];
  skillsLoading: boolean;
  skillsError: string | null;

  // 选中的技能
  selectedSkill: SkillMeta | null;

  // 导出/导入状态
  exporting: boolean;
  importing: boolean;

  // 删除状态
  deleting: boolean;

  // Actions
  loadSkills: () => Promise<void>;
  selectSkill: (skill: SkillMeta | null) => void;
  exportSkill: (skillName: string) => Promise<{ zipData: Uint8Array; fileName: string } | null>;
  importSkill: (filePath: string) => Promise<SkillMeta | null>;
  importSkillFromBuffer: (buffer: Uint8Array) => Promise<SkillMeta | null>;
  importSkillFromContent: (content: string) => Promise<SkillMeta | null>;
  deleteSkill: (skillName: string) => Promise<boolean>;
  setSkillVisibility: (skillName: string, visibility: SkillVisibility) => Promise<boolean>;
  reloadSkills: () => Promise<void>;
  reset: () => void;
}

export const useSkillsStore = create<SkillsState>((set, get) => ({
  // Initial state
  skills: [],
  skillsLoading: false,
  skillsError: null,
  selectedSkill: null,
  exporting: false,
  importing: false,
  deleting: false,

  // 加载技能列表
  loadSkills: async () => {
    set({ skillsLoading: true, skillsError: null });
    try {
      const result = await (window as any).electronAPI.skills.listSimple();
      if (result.success) {
        set({ skills: result.skills || [], skillsLoading: false });
      } else {
        set({ skillsError: result.error || 'Failed to load skills', skillsLoading: false });
      }
    } catch (error: any) {
      set({ skillsError: error.message, skillsLoading: false });
    }
  },

  // 选择技能
  selectSkill: (skill) => {
    set({ selectedSkill: skill });
  },

  // 导出技能（返回 zip Buffer）
  exportSkill: async (skillName) => {
    set({ exporting: true });
    try {
      const result = await (window as any).electronAPI.skills.export(skillName);
      if (result.success && result.zipData) {
        set({ exporting: false });
        return {
          zipData: result.zipData,
          fileName: result.suggestedFileName || `${skillName}.zip`,
        };
      } else {
        set({ exporting: false });
        console.error('Failed to export skill:', result.error);
        return null;
      }
    } catch (error: any) {
      set({ exporting: false });
      console.error('Failed to export skill:', error);
      return null;
    }
  },

  // 导入技能（从文件）
  importSkill: async (filePath) => {
    set({ importing: true });
    try {
      const result = await (window as any).electronAPI.skills.import(filePath);
      if (result.success && result.skill) {
        // 重新加载技能列表
        await get().loadSkills();
        set({ importing: false });
        return result.skill;
      } else {
        set({ importing: false });
        console.error('Failed to import skill:', result.error);
        return null;
      }
    } catch (error: any) {
      set({ importing: false });
      console.error('Failed to import skill:', error);
      return null;
    }
  },

  // 导入技能（从内容）
  importSkillFromContent: async (content) => {
    set({ importing: true });
    try {
      const result = await (window as any).electronAPI.skills.importFromContent(content);
      if (result.success && result.skill) {
        // 重新加载技能列表
        await get().loadSkills();
        set({ importing: false });
        return result.skill;
      } else {
        set({ importing: false });
        console.error('Failed to import skill:', result.error);
        return null;
      }
    } catch (error: any) {
      set({ importing: false });
      console.error('Failed to import skill:', error);
      return null;
    }
  },

  // 导入技能（从 Buffer - 支持 zip 和 JSON 格式）
  importSkillFromBuffer: async (buffer) => {
    set({ importing: true });
    try {
      const result = await (window as any).electronAPI.skills.importFromBuffer(buffer);
      if (result.success && result.skill) {
        // 重新加载技能列表
        await get().loadSkills();
        set({ importing: false });
        return result.skill;
      } else {
        set({ importing: false });
        console.error('Failed to import skill:', result.error);
        return null;
      }
    } catch (error: any) {
      set({ importing: false });
      console.error('Failed to import skill:', error);
      return null;
    }
  },

  // 删除技能
  deleteSkill: async (skillName) => {
    set({ deleting: true });
    try {
      const result = await (window as any).electronAPI.skills.delete(skillName);
      if (result.success) {
        // 从列表中移除
        set((state) => ({
          skills: state.skills.filter((s) => s.name !== skillName),
          selectedSkill: state.selectedSkill?.name === skillName ? null : state.selectedSkill,
          deleting: false,
        }));
        return true;
      } else {
        set({ deleting: false });
        console.error('Failed to delete skill:', result.error);
        return false;
      }
    } catch (error: any) {
      set({ deleting: false });
      console.error('Failed to delete skill:', error);
      return false;
    }
  },

  // 设置技能可见性
  setSkillVisibility: async (skillName, visibility) => {
    try {
      const result = await (window as any).electronAPI.skills.setVisibility(skillName, visibility);
      if (result.success) {
        // 更新列表中的技能
        set((state) => ({
          skills: state.skills.map((s) =>
            s.name === skillName ? { ...s, visibility } : s
          ),
        }));
        return true;
      } else {
        console.error('Failed to set skill visibility:', result.error);
        return false;
      }
    } catch (error: any) {
      console.error('Failed to set skill visibility:', error);
      return false;
    }
  },

  // 重新加载技能
  reloadSkills: async () => {
    const result = await (window as any).electronAPI.skills.reloadWorkspace();
    if (result.success) {
      await get().loadSkills();
    }
  },

  // 重置所有状态
  reset: () => {
    set({
      skills: [],
      skillsLoading: false,
      skillsError: null,
      selectedSkill: null,
      exporting: false,
      importing: false,
      deleting: false,
    });
  },
}));
