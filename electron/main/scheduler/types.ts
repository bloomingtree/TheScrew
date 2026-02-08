/**
 * Scheduler Types - Cron Service and Heartbeat Service
 *
 * Based on nanobot architecture:
 * - https://github.com/nanobot-xyz/nanobot
 */

// ============================================================================
// Cron Types
// ============================================================================

/**
 * Schedule definition for a cron job
 */
export interface CronSchedule {
  /** Schedule type */
  kind: 'at' | 'every' | 'cron';
  /** For "at": timestamp in ms (optional) */
  at_ms?: number;
  /** For "every": interval in ms (optional) */
  every_ms?: number;
  /** For "cron": cron expression (e.g. "0 9 * * *") (optional) */
  expr?: string;
  /** Timezone for cron expressions (optional) */
  tz?: string;
}

/**
 * What to do when the job runs
 */
export interface CronPayload {
  /** Payload type */
  kind: 'message' | 'tool';
  /** Message content to process */
  message: string;
  /** Optional: tool names to activate */
  tools?: string[];
}

/**
 * Runtime state of a job
 */
export interface CronJobState {
  /** Next run time in ms (optional) */
  next_run_at_ms?: number | null;
  /** Last run time in ms (optional) */
  last_run_at_ms?: number | null;
  /** Last status: ok, error, skipped (optional) */
  last_status?: 'ok' | 'error' | 'skipped' | null;
  /** Last error message (optional) */
  last_error?: string | null;
}

/**
 * A scheduled job
 */
export interface CronJob {
  /** Unique job ID */
  id: string;
  /** Job name */
  name: string;
  /** Whether the job is enabled */
  enabled: boolean;
  /** Schedule configuration */
  schedule: CronSchedule;
  /** Job payload */
  payload: CronPayload;
  /** Runtime state */
  state: CronJobState;
  /** Creation timestamp in ms */
  created_at_ms: number;
  /** Last update timestamp in ms */
  updated_at_ms: number;
  /** Whether to delete after execution (one-shot jobs) */
  delete_after_run: boolean;
}

/**
 * Persistent store for cron jobs
 */
export interface CronStore {
  /** Store version */
  version: number;
  /** List of jobs */
  jobs: CronJob[];
}

// ============================================================================
// Heartbeat Types
// ============================================================================

/**
 * Heartbeat service configuration
 */
export interface HeartbeatConfig {
  /** Workspace path containing HEARTBEAT.md */
  workspace_path: string;
  /** Heartbeat interval in seconds (default: 30 minutes) */
  interval_seconds?: number;
  /** Whether heartbeat is enabled */
  enabled?: boolean;
}

/**
 * Heartbeat task entry (parsed from HEARTBEAT.md)
 */
export interface HeartbeatTask {
  /** Task title/header */
  title?: string;
  /** Task description */
  description?: string;
  /** Whether task is completed */
  completed: boolean;
}

// ============================================================================
// Callback Types
// ============================================================================

/**
 * Callback type for cron job execution
 * @param job The cron job to execute
 * @returns Promise with response text (optional)
 */
export type CronJobCallback = (job: CronJob) => Promise<string | undefined>;

/**
 * Callback type for heartbeat execution
 * @param message The message to process
 * @returns Promise with response text
 */
export type HeartbeatCallback = (message: string) => Promise<string>;

// ============================================================================
// Constants
// ============================================================================

/** Default heartbeat interval in seconds (30 minutes) */
export const DEFAULT_HEARTBEAT_INTERVAL_S = 30 * 60;

/** Token that indicates "nothing to do" during heartbeat */
export const HEARTBEAT_OK_TOKEN = 'HEARTBEAT_OK';

/** Default heartbeat prompt */
export const HEARTBEAT_PROMPT = `Read HEARTBEAT.md in your workspace (if it exists).
Follow any instructions or tasks listed there.
If nothing needs attention, reply with just: HEARTBEAT_OK`;
