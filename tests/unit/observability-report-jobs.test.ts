/**
 * Observability Report Jobs Unit Tests - P13
 *
 * Tests for job metrics integration in daily/weekly reports
 */

import {
  generateReport,
  formatReportMarkdown,
  getLast24hPeriod,
  ReportData,
} from '../../src/proxy-mcp/observability/report';
import { JobQueue, JobStoreService, InMemoryJobStore, setJobStore, clearJobStore } from '../../src/proxy-mcp/jobs';

describe('Observability Report - Job Metrics', () => {
  let store: JobStoreService;
  let queue: JobQueue;

  beforeEach(async () => {
    store = new JobStoreService(new InMemoryJobStore());
    await store.init();
    setJobStore(store); // Set as the global job store for report
    queue = new JobQueue(store);
  });

  afterEach(async () => {
    await store.close();
    clearJobStore(); // Clear global store for next test
  });

  describe('generateReport with job metrics', () => {
    it('should include job metrics in report', async () => {
      const period = getLast24hPeriod();
      const report = await generateReport(period, queue);

      expect(report.jobMetrics).toBeDefined();
      expect(typeof report.jobMetrics?.queueSize).toBe('number');
      expect(typeof report.jobMetrics?.running).toBe('number');
      expect(typeof report.jobMetrics?.waitingApproval).toBe('number');
      expect(typeof report.jobMetrics?.dlqCount).toBe('number');
      expect(typeof report.jobMetrics?.succeeded).toBe('number');
      expect(typeof report.jobMetrics?.failed).toBe('number');
      expect(typeof report.jobMetrics?.backpressureActive).toBe('boolean');
      expect(typeof report.jobMetrics?.utilizationPercent).toBe('number');
      expect(Array.isArray(report.jobMetrics?.topFailureReasons)).toBe(true);
    });

    it('should reflect actual job counts', async () => {
      // Create some jobs
      await store.createJob({ entrypoint: 'test', params: { id: 1 } });
      await store.createJob({ entrypoint: 'test', params: { id: 2 } });
      await store.createJob({ entrypoint: 'test', params: { id: 3 } });

      const period = getLast24hPeriod();
      const report = await generateReport(period, queue);

      expect(report.jobMetrics?.queueSize).toBe(3);
    });

    it('should track DLQ count from queue', async () => {
      // Create a job and move to DLQ
      const job = await store.createJob({
        entrypoint: 'test',
        params: { fail: true },
        maxAttempts: 1,
      });

      // Start and fail the job
      await store.startJob(job.id);
      await queue.complete(job.id, false, 'Test failure');

      const period = getLast24hPeriod();
      const report = await generateReport(period, queue);

      expect(report.jobMetrics?.dlqCount).toBe(1);
    });
  });

  describe('formatReportMarkdown with job metrics', () => {
    it('should format job metrics section', () => {
      const mockData: ReportData = {
        period: {
          start: new Date('2024-01-01T00:00:00Z'),
          end: new Date('2024-01-02T00:00:00Z'),
          label: 'Daily (24h)',
        },
        totalEvents: 100,
        successRate: 0.95,
        failureCount: 5,
        mcpMetrics: [],
        topErrors: [],
        topSkills: [],
        topTools: [],
        circuitSummary: { total: 4, closed: 4, open: 0, halfOpen: 0 },
        jobMetrics: {
          queueSize: 5,
          running: 2,
          waitingApproval: 3,
          dlqCount: 1,
          succeeded: 100,
          failed: 5,
          backpressureActive: false,
          utilizationPercent: 10,
          topFailureReasons: [{ reason: 'Connection timeout', count: 3 }],
        },
        recommendations: [],
      };

      const markdown = formatReportMarkdown(mockData);

      expect(markdown).toContain('## Job実行状態');
      expect(markdown).toContain('キュー待ち | 5');
      expect(markdown).toContain('実行中 | 2');
      expect(markdown).toContain('承認待ち | 3');
      expect(markdown).toContain('DLQ | 1');
      expect(markdown).toContain('成功 | 100');
      expect(markdown).toContain('失敗 | 5');
      expect(markdown).toContain('正常');
      expect(markdown).toContain('キュー使用率 | 10%');
      expect(markdown).toContain('### 主な失敗理由');
      expect(markdown).toContain('Connection timeout');
    });

    it('should show backpressure warning when active', () => {
      const mockData: ReportData = {
        period: getLast24hPeriod(),
        totalEvents: 0,
        successRate: 1,
        failureCount: 0,
        mcpMetrics: [],
        topErrors: [],
        topSkills: [],
        topTools: [],
        circuitSummary: { total: 0, closed: 0, open: 0, halfOpen: 0 },
        jobMetrics: {
          queueSize: 80,
          running: 3,
          waitingApproval: 0,
          dlqCount: 0,
          succeeded: 0,
          failed: 0,
          backpressureActive: true,
          utilizationPercent: 80,
          topFailureReasons: [],
        },
        recommendations: [],
      };

      const markdown = formatReportMarkdown(mockData);

      expect(markdown).toContain('⚠️ 有効');
    });

    it('should not show job section when jobMetrics is undefined', () => {
      const mockData: ReportData = {
        period: getLast24hPeriod(),
        totalEvents: 0,
        successRate: 1,
        failureCount: 0,
        mcpMetrics: [],
        topErrors: [],
        topSkills: [],
        topTools: [],
        circuitSummary: { total: 0, closed: 0, open: 0, halfOpen: 0 },
        recommendations: [],
      };

      const markdown = formatReportMarkdown(mockData);

      expect(markdown).not.toContain('## Job実行状態');
    });
  });

  describe('job-related recommendations', () => {
    it('should track DLQ in job metrics when DLQ has items', async () => {
      // Create and fail a job to DLQ
      const job = await store.createJob({
        entrypoint: 'test',
        params: { fail: true },
        maxAttempts: 1,
      });
      await store.startJob(job.id);
      await queue.complete(job.id, false, 'Test failure');

      const period = getLast24hPeriod();
      const report = await generateReport(period, queue);

      // Verify DLQ count is tracked in job metrics
      expect(report.jobMetrics?.dlqCount).toBe(1);
    });

    it('should track waiting approval count in job metrics', async () => {
      // Create jobs and put them in waiting_approval status
      for (let i = 0; i < 6; i++) {
        const job = await store.createJob({
          entrypoint: 'supervisor',
          params: { taskId: i },
        });
        await store.waitForApproval(job.id, 100 + i);
      }

      const period = getLast24hPeriod();
      const report = await generateReport(period, queue);

      // Verify waiting approval count is tracked in job metrics
      expect(report.jobMetrics?.waitingApproval).toBe(6);
    });
  });

  describe('redaction of sensitive data', () => {
    it('should redact GitHub tokens in failure reasons', async () => {
      const job = await store.createJob({
        entrypoint: 'test',
        params: {},
        maxAttempts: 1,
      });
      await store.startJob(job.id);
      // Fail with a message containing a fake token
      await store.failJob(job.id, 'Auth failed: token=ghp_1234567890abcdefghijklmnopqrstuvwxyz');

      const period = getLast24hPeriod();
      const report = await generateReport(period);

      // Check that the token is redacted in failure reasons
      const hasRedacted = report.jobMetrics?.topFailureReasons.some(
        (r) => r.reason.includes('[REDACTED]')
      );
      const hasToken = report.jobMetrics?.topFailureReasons.some(
        (r) => r.reason.includes('ghp_')
      );

      expect(hasRedacted || !hasToken).toBe(true);
    });

    it('should redact API keys in failure reasons', async () => {
      const job = await store.createJob({
        entrypoint: 'test',
        params: {},
        maxAttempts: 1,
      });
      await store.startJob(job.id);
      // Fail with a message containing a fake API key
      await store.failJob(job.id, 'OpenAI error: key=sk-1234567890abcdefghijklmnopqrstuvwxyz');

      const period = getLast24hPeriod();
      const report = await generateReport(period);

      const hasToken = report.jobMetrics?.topFailureReasons.some(
        (r) => r.reason.includes('sk-1234567890')
      );

      expect(hasToken).toBe(false);
    });
  });
});
