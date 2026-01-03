/**
 * SLO Evaluation Tests - P14
 */

import {
  evaluateSLOsSync,
  getThresholds,
  MetricsSnapshot,
  SLOThresholds,
  DEFAULT_THRESHOLDS,
  SLOConfig,
} from '../../src/proxy-mcp/ops/slo';

describe('SLO Evaluation', () => {
  const createMetrics = (overrides: Partial<MetricsSnapshot> = {}): MetricsSnapshot => ({
    queueSize: 10,
    runningJobs: 2,
    waitingApprovalCount: 1,
    waitingApprovalMaxMinutes: 30,
    dlqCount: 0,
    dlqNewCount: 0,
    succeededJobs: 100,
    failedJobs: 2,
    watcherConsecutiveErrors: 0,
    circuitBreakersOpen: 0,
    circuitBreakersTotal: 5,
    ...overrides,
  });

  describe('evaluateSLOsSync', () => {
    it('should return OK when all metrics are within thresholds', () => {
      const metrics = createMetrics();
      const result = evaluateSLOsSync(metrics);

      expect(result.overallStatus).toBe('ok');
      expect(result.summary).toBe('All SLOs within thresholds');
      expect(result.checks.every((c) => c.status === 'ok')).toBe(true);
    });

    it('should return WARN for queue size above warn threshold', () => {
      const metrics = createMetrics({ queueSize: 75 });
      const result = evaluateSLOsSync(metrics);

      expect(result.overallStatus).toBe('warn');
      const queueCheck = result.checks.find((c) => c.name === 'queue_size');
      expect(queueCheck?.status).toBe('warn');
    });

    it('should return CRITICAL for queue size above critical threshold', () => {
      const metrics = createMetrics({ queueSize: 250 });
      const result = evaluateSLOsSync(metrics);

      expect(result.overallStatus).toBe('critical');
      const queueCheck = result.checks.find((c) => c.name === 'queue_size');
      expect(queueCheck?.status).toBe('critical');
    });

    it('should return WARN for waiting approval above warn threshold', () => {
      const metrics = createMetrics({
        waitingApprovalCount: 3,
        waitingApprovalMaxMinutes: 90,
      });
      const result = evaluateSLOsSync(metrics);

      expect(result.overallStatus).toBe('warn');
      const waitingCheck = result.checks.find((c) => c.name === 'waiting_approval');
      expect(waitingCheck?.status).toBe('warn');
    });

    it('should return CRITICAL for waiting approval above critical threshold', () => {
      const metrics = createMetrics({
        waitingApprovalCount: 5,
        waitingApprovalMaxMinutes: 400,
      });
      const result = evaluateSLOsSync(metrics);

      expect(result.overallStatus).toBe('critical');
      const waitingCheck = result.checks.find((c) => c.name === 'waiting_approval');
      expect(waitingCheck?.status).toBe('critical');
    });

    it('should return WARN for DLQ new entries above warn threshold', () => {
      const metrics = createMetrics({ dlqNewCount: 7, dlqCount: 10 });
      const result = evaluateSLOsSync(metrics);

      expect(result.overallStatus).toBe('warn');
      const dlqCheck = result.checks.find((c) => c.name === 'dlq_new');
      expect(dlqCheck?.status).toBe('warn');
    });

    it('should return CRITICAL for DLQ new entries above critical threshold', () => {
      const metrics = createMetrics({ dlqNewCount: 25, dlqCount: 30 });
      const result = evaluateSLOsSync(metrics);

      expect(result.overallStatus).toBe('critical');
      const dlqCheck = result.checks.find((c) => c.name === 'dlq_new');
      expect(dlqCheck?.status).toBe('critical');
    });

    it('should return WARN for failure rate above warn threshold', () => {
      const metrics = createMetrics({ succeededJobs: 90, failedJobs: 10 }); // 10% failure rate
      const result = evaluateSLOsSync(metrics);

      expect(result.overallStatus).toBe('warn');
      const failureCheck = result.checks.find((c) => c.name === 'failure_rate');
      expect(failureCheck?.status).toBe('warn');
    });

    it('should return CRITICAL for failure rate above critical threshold', () => {
      const metrics = createMetrics({ succeededJobs: 80, failedJobs: 20 }); // 20% failure rate
      const result = evaluateSLOsSync(metrics);

      expect(result.overallStatus).toBe('critical');
      const failureCheck = result.checks.find((c) => c.name === 'failure_rate');
      expect(failureCheck?.status).toBe('critical');
    });

    it('should return WARN for circuit breakers above warn threshold', () => {
      const metrics = createMetrics({ circuitBreakersOpen: 2, circuitBreakersTotal: 5 });
      const result = evaluateSLOsSync(metrics);

      expect(result.overallStatus).toBe('warn');
      const cbCheck = result.checks.find((c) => c.name === 'circuit_breakers');
      expect(cbCheck?.status).toBe('warn');
    });

    it('should return CRITICAL for circuit breakers above critical threshold', () => {
      const metrics = createMetrics({ circuitBreakersOpen: 4, circuitBreakersTotal: 5 });
      const result = evaluateSLOsSync(metrics);

      expect(result.overallStatus).toBe('critical');
      const cbCheck = result.checks.find((c) => c.name === 'circuit_breakers');
      expect(cbCheck?.status).toBe('critical');
    });

    it('should handle zero total jobs for failure rate calculation', () => {
      const metrics = createMetrics({ succeededJobs: 0, failedJobs: 0 });
      const result = evaluateSLOsSync(metrics);

      const failureCheck = result.checks.find((c) => c.name === 'failure_rate');
      expect(failureCheck?.status).toBe('ok');
      expect(failureCheck?.currentValue).toBe('0.0%');
    });

    it('should use custom thresholds when provided', () => {
      const customThresholds: SLOThresholds = {
        ...DEFAULT_THRESHOLDS,
        queue: {
          sizeWarn: 5,
          sizeCritical: 10,
        },
      };
      const metrics = createMetrics({ queueSize: 8 });
      const result = evaluateSLOsSync(metrics, customThresholds);

      const queueCheck = result.checks.find((c) => c.name === 'queue_size');
      expect(queueCheck?.status).toBe('warn');
    });

    it('should include timestamp in result', () => {
      const metrics = createMetrics();
      const result = evaluateSLOsSync(metrics);

      expect(result.timestamp).toBeDefined();
      expect(new Date(result.timestamp).getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('should list all failed checks in summary', () => {
      const metrics = createMetrics({
        queueSize: 250, // critical
        waitingApprovalMaxMinutes: 90, // warn
      });
      const result = evaluateSLOsSync(metrics);

      expect(result.overallStatus).toBe('critical');
      expect(result.summary).toContain('queue_size');
      expect(result.summary).toContain('waiting_approval');
    });
  });

  describe('getThresholds', () => {
    it('should return default thresholds when no config provided', () => {
      const thresholds = getThresholds(undefined);
      expect(thresholds).toEqual(DEFAULT_THRESHOLDS);
    });

    it('should merge config thresholds with defaults', () => {
      const config: SLOConfig = {
        version: '1.0.0',
        thresholds: {
          queue: { sizeWarn: 100, sizeCritical: 300 },
          waitingApproval: { warnMinutes: 30, criticalMinutes: 120 },
          dlq: { newWarn: 10, newCritical: 30 },
          jobFailure: { rateWarn: 0.1, rateCritical: 0.2 },
        },
      };
      const thresholds = getThresholds(config);

      expect(thresholds.queue.sizeWarn).toBe(100);
      expect(thresholds.queue.sizeCritical).toBe(300);
      expect(thresholds.waitingApproval.warnMinutes).toBe(30);
      expect(thresholds.circuitBreaker).toBeDefined(); // from defaults
    });
  });
});
