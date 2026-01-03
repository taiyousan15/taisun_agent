/**
 * SLO Scheduler Types - P15
 *
 * Type definitions for the SLO scheduler daemon
 */

import { SLOStatus } from '../slo/types';

/**
 * Scheduler configuration
 */
export interface SchedulerConfig {
  version: string;
  scheduler: {
    intervalSeconds: number;
    cooldown: {
      warnMinutes: number;
      criticalMinutes: number;
    };
    postOnRecovery: boolean;
    enabled: boolean;
  };
  alerts: {
    targetIssueNumber: number | null;
    owner: string;
    repo: string;
  };
  stateFile: string;
}

/**
 * Default scheduler configuration
 */
export const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  version: '1.0.0',
  scheduler: {
    intervalSeconds: 300,
    cooldown: {
      warnMinutes: 120,
      criticalMinutes: 30,
    },
    postOnRecovery: true,
    enabled: true,
  },
  alerts: {
    targetIssueNumber: null,
    owner: 'taiyousan15',
    repo: 'taisun_agent',
  },
  stateFile: '.taisun/slo-scheduler-state.json',
};

/**
 * Scheduler state for persistence
 */
export interface SchedulerState {
  lastStatus: SLOStatus | null;
  lastPostTime: string | null;
  lastCheckTime: string | null;
  consecutiveOkCount: number;
}

/**
 * Initial scheduler state
 */
export const INITIAL_SCHEDULER_STATE: SchedulerState = {
  lastStatus: null,
  lastPostTime: null,
  lastCheckTime: null,
  consecutiveOkCount: 0,
};

/**
 * Run result from a single scheduler cycle
 */
export interface RunOnceResult {
  status: SLOStatus;
  action: 'posted' | 'suppressed' | 'skipped';
  reason: string;
  timestamp: string;
  postUrl?: string;
}

/**
 * Suppression reason
 */
export type SuppressionReason =
  | 'status_unchanged'
  | 'cooldown_active'
  | 'scheduler_disabled'
  | 'dry_run';

/**
 * Scheduler event types for observability
 */
export type SchedulerEventType =
  | 'slo_checked'
  | 'slo_alert_posted'
  | 'slo_alert_suppressed'
  | 'slo_recovered';
