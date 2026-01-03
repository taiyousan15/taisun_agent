/**
 * SLO Evaluation Engine - P14
 *
 * Evaluates current metrics against SLO thresholds
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  SLOConfig,
  SLOThresholds,
  SLOStatus,
  SLOCheckResult,
  SLOEvaluationResult,
  MetricsSnapshot,
  DEFAULT_THRESHOLDS,
} from './types';
import { getJobStore, JobQueue } from '../../jobs';
import { getCircuitSummary } from '../../internal/circuit-breaker';

const CONFIG_PATH = path.join(process.cwd(), 'config', 'proxy-mcp', 'slo.json');

/**
 * Load SLO configuration from file
 */
export function loadSLOConfig(): SLOConfig {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const content = fs.readFileSync(CONFIG_PATH, 'utf-8');
      return JSON.parse(content) as SLOConfig;
    }
  } catch (error) {
    console.error('[slo] Failed to load config:', error);
  }

  // Return default config
  return {
    version: '1.0.0',
    thresholds: DEFAULT_THRESHOLDS,
  };
}

/**
 * Get thresholds from config with defaults
 */
export function getThresholds(config?: SLOConfig): SLOThresholds {
  if (!config) {
    return DEFAULT_THRESHOLDS;
  }
  return {
    queue: { ...DEFAULT_THRESHOLDS.queue, ...config.thresholds.queue },
    waitingApproval: { ...DEFAULT_THRESHOLDS.waitingApproval, ...config.thresholds.waitingApproval },
    dlq: { ...DEFAULT_THRESHOLDS.dlq, ...config.thresholds.dlq },
    jobFailure: { ...DEFAULT_THRESHOLDS.jobFailure, ...config.thresholds.jobFailure },
    watcherErrors: {
      ...DEFAULT_THRESHOLDS.watcherErrors!,
      ...(config.thresholds.watcherErrors || {}),
    },
    circuitBreaker: {
      ...DEFAULT_THRESHOLDS.circuitBreaker!,
      ...(config.thresholds.circuitBreaker || {}),
    },
  };
}

/**
 * Collect current metrics from jobs and observability
 */
export async function collectMetrics(queue?: JobQueue): Promise<MetricsSnapshot> {
  const store = getJobStore();
  await store.init();
  const stats = await store.getStats();

  // Get waiting approval max age
  const waitingJobs = await store.listByStatus('waiting_approval', 100);
  let maxWaitMinutes = 0;
  const now = Date.now();
  for (const job of waitingJobs) {
    if (job.updatedAt) {
      const waitMs = now - new Date(job.updatedAt).getTime();
      const waitMinutes = Math.floor(waitMs / 60000);
      if (waitMinutes > maxWaitMinutes) {
        maxWaitMinutes = waitMinutes;
      }
    }
  }

  // Get DLQ info
  let dlqCount = 0;
  let dlqNewCount = 0;
  if (queue) {
    const dlqEntries = queue.getDLQ();
    dlqCount = dlqEntries.length;
    // Count entries added in last 24h
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    dlqNewCount = dlqEntries.filter((e) => new Date(e.addedAt) >= oneDayAgo).length;
  }

  // Get circuit breaker info
  const circuitSummary = getCircuitSummary();

  return {
    queueSize: stats.queued,
    runningJobs: stats.running,
    waitingApprovalCount: stats.waiting_approval,
    waitingApprovalMaxMinutes: maxWaitMinutes,
    dlqCount,
    dlqNewCount,
    succeededJobs: stats.succeeded,
    failedJobs: stats.failed,
    watcherConsecutiveErrors: 0, // Would come from watcher state
    circuitBreakersOpen: circuitSummary.open,
    circuitBreakersTotal: circuitSummary.total,
  };
}

/**
 * Determine status based on value and thresholds
 */
function checkThreshold(
  value: number,
  warnThreshold: number,
  criticalThreshold: number,
  lowerIsBetter: boolean = false
): SLOStatus {
  if (lowerIsBetter) {
    if (value >= criticalThreshold) return 'critical';
    if (value >= warnThreshold) return 'warn';
    return 'ok';
  } else {
    if (value >= criticalThreshold) return 'critical';
    if (value >= warnThreshold) return 'warn';
    return 'ok';
  }
}

/**
 * Evaluate queue size SLO
 */
function evaluateQueueSize(metrics: MetricsSnapshot, thresholds: SLOThresholds): SLOCheckResult {
  const status = checkThreshold(metrics.queueSize, thresholds.queue.sizeWarn, thresholds.queue.sizeCritical);
  return {
    name: 'queue_size',
    status,
    currentValue: metrics.queueSize,
    threshold: status === 'critical' ? thresholds.queue.sizeCritical : thresholds.queue.sizeWarn,
    message:
      status === 'ok'
        ? `Queue size OK (${metrics.queueSize})`
        : `Queue size ${status.toUpperCase()}: ${metrics.queueSize} jobs queued`,
  };
}

/**
 * Evaluate waiting approval SLO
 */
function evaluateWaitingApproval(metrics: MetricsSnapshot, thresholds: SLOThresholds): SLOCheckResult {
  const status = checkThreshold(
    metrics.waitingApprovalMaxMinutes,
    thresholds.waitingApproval.warnMinutes,
    thresholds.waitingApproval.criticalMinutes
  );
  return {
    name: 'waiting_approval',
    status,
    currentValue: `${metrics.waitingApprovalMaxMinutes}min (${metrics.waitingApprovalCount} jobs)`,
    threshold: `${status === 'critical' ? thresholds.waitingApproval.criticalMinutes : thresholds.waitingApproval.warnMinutes}min`,
    message:
      status === 'ok'
        ? `Waiting approval OK (${metrics.waitingApprovalCount} jobs, max ${metrics.waitingApprovalMaxMinutes}min)`
        : `Waiting approval ${status.toUpperCase()}: ${metrics.waitingApprovalCount} jobs waiting, oldest ${metrics.waitingApprovalMaxMinutes}min`,
  };
}

/**
 * Evaluate DLQ SLO
 */
function evaluateDLQ(metrics: MetricsSnapshot, thresholds: SLOThresholds): SLOCheckResult {
  const status = checkThreshold(metrics.dlqNewCount, thresholds.dlq.newWarn, thresholds.dlq.newCritical);
  return {
    name: 'dlq_new',
    status,
    currentValue: `${metrics.dlqNewCount} new (${metrics.dlqCount} total)`,
    threshold: status === 'critical' ? thresholds.dlq.newCritical : thresholds.dlq.newWarn,
    message:
      status === 'ok'
        ? `DLQ OK (${metrics.dlqNewCount} new in 24h)`
        : `DLQ ${status.toUpperCase()}: ${metrics.dlqNewCount} new entries in 24h`,
  };
}

/**
 * Evaluate job failure rate SLO
 */
function evaluateFailureRate(metrics: MetricsSnapshot, thresholds: SLOThresholds): SLOCheckResult {
  const total = metrics.succeededJobs + metrics.failedJobs;
  const rate = total > 0 ? metrics.failedJobs / total : 0;
  const status = checkThreshold(rate, thresholds.jobFailure.rateWarn, thresholds.jobFailure.rateCritical);
  const ratePercent = (rate * 100).toFixed(1);
  return {
    name: 'failure_rate',
    status,
    currentValue: `${ratePercent}%`,
    threshold: `${(status === 'critical' ? thresholds.jobFailure.rateCritical : thresholds.jobFailure.rateWarn) * 100}%`,
    message:
      status === 'ok'
        ? `Failure rate OK (${ratePercent}%)`
        : `Failure rate ${status.toUpperCase()}: ${ratePercent}% (${metrics.failedJobs}/${total})`,
  };
}

/**
 * Evaluate circuit breaker SLO
 */
function evaluateCircuitBreakers(metrics: MetricsSnapshot, thresholds: SLOThresholds): SLOCheckResult {
  const cbThresholds = thresholds.circuitBreaker || DEFAULT_THRESHOLDS.circuitBreaker!;
  const status = checkThreshold(metrics.circuitBreakersOpen, cbThresholds.openWarn, cbThresholds.openCritical);
  return {
    name: 'circuit_breakers',
    status,
    currentValue: `${metrics.circuitBreakersOpen}/${metrics.circuitBreakersTotal} open`,
    threshold: status === 'critical' ? cbThresholds.openCritical : cbThresholds.openWarn,
    message:
      status === 'ok'
        ? `Circuit breakers OK (${metrics.circuitBreakersOpen} open)`
        : `Circuit breakers ${status.toUpperCase()}: ${metrics.circuitBreakersOpen} MCPs have open circuits`,
  };
}

/**
 * Get overall status from check results
 */
function getOverallStatus(checks: SLOCheckResult[]): SLOStatus {
  if (checks.some((c) => c.status === 'critical')) return 'critical';
  if (checks.some((c) => c.status === 'warn')) return 'warn';
  return 'ok';
}

/**
 * Evaluate all SLOs against current metrics
 */
export async function evaluateSLOs(queue?: JobQueue, config?: SLOConfig): Promise<SLOEvaluationResult> {
  const effectiveConfig = config || loadSLOConfig();
  const thresholds = getThresholds(effectiveConfig);
  const metrics = await collectMetrics(queue);

  const checks: SLOCheckResult[] = [
    evaluateQueueSize(metrics, thresholds),
    evaluateWaitingApproval(metrics, thresholds),
    evaluateDLQ(metrics, thresholds),
    evaluateFailureRate(metrics, thresholds),
    evaluateCircuitBreakers(metrics, thresholds),
  ];

  const overallStatus = getOverallStatus(checks);
  const failedChecks = checks.filter((c) => c.status !== 'ok');

  let summary: string;
  if (overallStatus === 'ok') {
    summary = 'All SLOs within thresholds';
  } else {
    const issues = failedChecks.map((c) => c.name).join(', ');
    summary = `${overallStatus.toUpperCase()}: Issues with ${issues}`;
  }

  return {
    timestamp: new Date().toISOString(),
    overallStatus,
    checks,
    summary,
  };
}

/**
 * Evaluate SLOs with provided metrics (for testing)
 */
export function evaluateSLOsSync(metrics: MetricsSnapshot, thresholds?: SLOThresholds): SLOEvaluationResult {
  const effectiveThresholds = thresholds || DEFAULT_THRESHOLDS;

  const checks: SLOCheckResult[] = [
    evaluateQueueSize(metrics, effectiveThresholds),
    evaluateWaitingApproval(metrics, effectiveThresholds),
    evaluateDLQ(metrics, effectiveThresholds),
    evaluateFailureRate(metrics, effectiveThresholds),
    evaluateCircuitBreakers(metrics, effectiveThresholds),
  ];

  const overallStatus = getOverallStatus(checks);
  const failedChecks = checks.filter((c) => c.status !== 'ok');

  let summary: string;
  if (overallStatus === 'ok') {
    summary = 'All SLOs within thresholds';
  } else {
    const issues = failedChecks.map((c) => c.name).join(', ');
    summary = `${overallStatus.toUpperCase()}: Issues with ${issues}`;
  }

  return {
    timestamp: new Date().toISOString(),
    overallStatus,
    checks,
    summary,
  };
}
