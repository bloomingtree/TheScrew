/**
 * Memory Module Types
 */

// Re-export core memory types
export * from '../core/types';

/**
 * Memory search options
 */
export interface MemorySearchOptions {
  types?: 'long_term' | 'daily_note' | ('long_term' | 'daily_note')[];
  maxDays?: number;
  maxResults?: number;
}

/**
 * Memory statistics
 */
export interface MemoryStats {
  longTermMemorySize: number;
  dailyNotesCount: number;
  totalMemories: number;
}

/**
 * Memory entry with metadata
 */
export interface MemoryEntryWithMeta {
  content: string;
  timestamp: Date;
  tags?: string[];
  size: number;
}
