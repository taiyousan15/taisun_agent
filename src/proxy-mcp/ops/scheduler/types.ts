/**
 * SLO Scheduler Types - P15
 *
 * Type definitions for the SLO scheduler daemon
 */

import type { SLOStatus } from '../slo/types';

/**
 * Scheduler state
 */
export interface SchedulerState {
  lastStatus: SLOStatus | null;
  lastPostTime: string | null;
  lastCheckTime: string | null;
  consecutiveOkCount: number;
}

/**
 * Scheduler cooldown configuration
 */
export interface SchedulerCooldown {
  warnMinutes: number;
  criticalMinutes: number;
}

/**
 * Scheduler configuration
 */
export interface SchedulerConfig {
  version: string;
  scheduler: {
    intervalSeconds: number;
    cooldown: SchedulerCooldown;
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
 * Run once result
 */
export interface RunOnceResult {
  status: SLOStatus;
  action: 'posted' | 'suppressed' | 'skipped';
  reason: string;
  timestamp: string;
  postUrl?: string;
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
 * Initial scheduler state
 */
export const INITIAL_SCHEDULER_STATE: SchedulerState = {
  lastStatus: null,
  lastPostTime: null,
  lastCheckTime: null,
  consecutiveOkCount: 0,
};
