/**
 * Core Module - Zero-Employee Architecture
 * Based on nanobot architecture patterns
 *
 * This module exports all core system components:
 * - Type definitions: Core interfaces and types
 * - SkillManager: Progressive skill loading
 * - ContextBuilder: System prompt construction
 */

// ============================================================================
// Type Exports
// ============================================================================

export * from './types';

// Re-export commonly used types for convenience
export type {
  ITool,
  ToolResult,
  IToolCall,
  IToolResult,
  ISkillMeta,
  ISkill,
  IInboundMessage,
  IOutboundMessage,
  ISessionMessage,
  ISessionMemory,
  ISession,
  ISubagentTask,
  IMemoryEntry,
  IMemorySearchResult,
  IAgentConfig,
  ILLMMessage,
  ILLMChunk,
  ILLMConfig,
  ICoreConfig,
  IToolExecutionContext,
  MemoryEntryType,
} from './types';

// ============================================================================
// Skill Manager
// ============================================================================

export {
  SkillManager,
  getSkillManager,
  resetSkillManager,
} from './SkillManager';

// ============================================================================
// SimpleSkill Manager (nanobot-style)
// ============================================================================

export {
  SimpleSkillManager,
  getSimpleSkillManager,
  setSimpleSkillManager,
  resetSimpleSkillManager,
} from './SimpleSkillManager';
export type { SkillMeta, Skill } from './SimpleSkillManager';

// ============================================================================
// Context Builder
// ============================================================================

export {
  ContextBuilder,
  getContextBuilder,
  resetContextBuilder,
} from './ContextBuilder';
export type { ContextBuilderOptions } from './ContextBuilder';

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Initialize core system components
 * Call this during application startup
 */
export async function initializeCore(_config?: {
  skillManager?: {
    workspacePath?: string;
  };
}): Promise<void> {
  console.log('[Core] Core system initialized');
}

/**
 * Reset all core singletons
 * Useful for testing
 */
export function resetCore(): void {
  resetSkillManager();
  console.log('[Core] All core systems reset');
}

import { resetSkillManager } from './SkillManager';

// ============================================================================
// Version Info
// ============================================================================

export const CORE_VERSION = '1.0.0';
export const CORE_COMPATIBILITY = 'nanobot-style';
