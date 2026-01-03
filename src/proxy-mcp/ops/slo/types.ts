/**
 * SLO Types - P14
 *
 * Type definitions for SLO evaluation and alerting
 */

/**
 * SLO evaluation status levels
 */
export type SLOStatus = 'ok' | 'warn' | 'critical';

/**
 * Individual SLO check result
 */
export interface SLOCheckResult {
  name: string;
  status: SLOStatus;
  currentValue: number | string;
  threshold: number | string;
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
 * Queue thresholds from config
 */
export interface QueueThresholds {
  sizeWarn: number;
  sizeCritical: number;
}

/**
 * Waiting approval thresholds from config
 */
export interface WaitingApprovalThresholds {
  warnMinutes: number;
  criticalMinutes: number;
}

/**
 * DLQ thresholds from config
 */
export interface DLQThresholds {
  newWarn: number;
  newCritical: number;
}

/**
 * Job failure rate thresholds from config
 */
export interface JobFailureThresholds {
  rateWarn: number;
  rateCritical: number;
}

/**
 * Watcher error thresholds from config
 */
export interface WatcherErrorThresholds {
  countWarn: number;
  countCritical: number;
}

/**
 * Circuit breaker thresholds from config
 */
export interface CircuitBreakerThresholds {
  openWarn: number;
  openCritical: number;
}

/**
 * All SLO thresholds
 */
export interface SLOThresholds {
  queue: QueueThresholds;
  waitingApproval: WaitingApprovalThresholds;
  dlq: DLQThresholds;
  jobFailure: JobFailureThresholds;
  watcherErrors?: WatcherErrorThresholds;
  circuitBreaker?: CircuitBreakerThresholds;
}

/**
 * Evaluation configuration
 */
export interface EvaluationConfig {
  periodHours: number;
  cooldownMinutes: number;
}

/**
 * Alert configuration
 */
export interface AlertConfig {
  enabled: boolean;
  mode: 'comment' | 'newIssue';
  targetIssueNumber: number | null;
  createNewOnCritical: boolean;
  repository: string | null;
}

/**
 * Full SLO configuration
 */
export interface SLOConfig {
  version: string;
  description?: string;
  thresholds: SLOThresholds;
  evaluation?: EvaluationConfig;
  alerts?: AlertConfig;
}

/**
 * Metrics snapshot for evaluation
 */
export interface MetricsSnapshot {
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
