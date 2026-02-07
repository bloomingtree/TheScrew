/**
 * Core Module - Zero-Employee Architecture
 * Based on nanobot architecture patterns
 *
 * This module exports all core system components:
 * - ToolRegistry: Centralized tool management
 * - MessageBus: Async message routing
 * - Type definitions: Core interfaces and types
 * - Adapters: Compatibility layer with existing tools
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
} from './types';

// ============================================================================
// Tool Registry
// ============================================================================

export {
  ToolRegistry,
  getToolRegistry,
  resetToolRegistry,
} from './ToolRegistry';

// ============================================================================
// Message Bus
// ============================================================================

export {
  MessageBus,
  getMessageBus,
  resetMessageBus,
} from './MessageBus';
export type { MessageBusConfig } from './MessageBus';

// ============================================================================
// Adapters
// ============================================================================

export {
  ToolAdapter,
  adaptTool,
  adaptTools,
  createSimpleTool,
  ToolGroupAdapter,
  adaptToolGroup,
  itoolToTool,
  itoolsToTools,
  ToolRegistryAdapter,
  createToolRegistryAdapter,
  ComposedTool,
  createComposedTool,
  FallbackTool,
  createFallbackTool,
} from './adapters';

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Initialize core system components
 * Call this during application startup
 */
export async function initializeCore(config?: {
  messageBus?: {
    maxQueueSize?: number;
    processingInterval?: number;
  };
}): Promise<void> {
  const { messageBus: mbConfig } = config || {};

  // Initialize message bus with config
  if (mbConfig) {
    getMessageBus(mbConfig);
  }

  console.log('[Core] Core system initialized');
}

/**
 * Reset all core singletons
 * Useful for testing
 */
export function resetCore(): void {
  resetToolRegistry();
  resetMessageBus();
  console.log('[Core] All core systems reset');
}

/**
 * Get core system statistics
 */
export function getCoreStats(): {
  toolRegistry: {
    totalTools: number;
    totalEstimatedTokens: number;
    toolsByCategory: Record<string, number>;
  };
  messageBus: {
    inboundQueueSize: number;
    outboundQueueSize: number;
    processing: boolean;
  };
} {
  const toolRegistry = getToolRegistry();
  const messageBus = getMessageBus();

  return {
    toolRegistry: toolRegistry.getStats(),
    messageBus: messageBus.getStats(),
  };
}

// ============================================================================
// Version Info
// ============================================================================

export const CORE_VERSION = '1.0.0';
export const CORE_COMPATIBILITY = 'nanobot-style';
