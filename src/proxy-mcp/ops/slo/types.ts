/**
 * SLO Types - P14
 *
 * Type definitions for SLO evaluation and alerting
 */

/**
 * SLO check status
 */
export type SLOStatus = 'ok' | 'warn' | 'critical';

/**
 * Individual SLO check result
 */
export interface SLOCheckResult {
  name: string;
  status: SLOStatus;
  currentValue: string | number;
  threshold: string | number;
  message: string;
}

/**
 * Overall SLO evaluation result
 */
export interface SLOEvaluationResult {
  timestamp: string;
  overallStatus: SLOStatus;
  checks: SLOCheckResult[];
  summary: string;
  refId?: string;
}

/**
 * SLO thresholds configuration
 */
export interface SLOThresholds {
  queue: {
    sizeWarn: number;
    sizeCritical: number;
  };
  waitingApproval: {
    warnMinutes: number;
    criticalMinutes: number;
  };
  dlq: {
    newWarn: number;
    newCritical: number;
  };
  jobFailure: {
    rateWarn: number;
    rateCritical: number;
  };
  watcherErrors: {
    countWarn: number;
    countCritical: number;
  };
  circuitBreaker: {
    openWarn: number;
    openCritical: number;
  };
}

/**
 * SLO configuration
 */
export interface SLOConfig {
  version: string;
  thresholds: SLOThresholds;
}

/**
 * SLO metrics
 */
export interface SLOMetrics {
  queueSize: number;
  runningJobs: number;
  waitingApprovalCount: number;
  waitingApprovalMaxMinutes: number;
  dlqCount: number;
  dlqNewCount: number;
  succeededJobs: number;
  failedJobs: number;
  watcherConsecutiveErrors: number;
  circuitBreakersOpen: number;
  circuitBreakersTotal: number;
}

/**
 * Default thresholds
 */
export const DEFAULT_THRESHOLDS: SLOThresholds = {
  queue: {
    sizeWarn: 50,
    sizeCritical: 200,
  },
  waitingApproval: {
    warnMinutes: 60,
    criticalMinutes: 360,
  },
  dlq: {
    newWarn: 5,
    newCritical: 20,
  },
  jobFailure: {
    rateWarn: 0.05,
    rateCritical: 0.15,
  },
  watcherErrors: {
    countWarn: 3,
    countCritical: 10,
  },
  circuitBreaker: {
    openWarn: 1,
    openCritical: 3,
  },
};
