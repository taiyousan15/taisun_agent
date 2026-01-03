/**
 * DLQ Triage Unit Tests - P13
 */

import {
  redactSensitiveData,
  generateTriageSummary,
  generateTriageIssueBody,
  formatTriageSummaryForConsole,
  DLQTriageSummary,
} from '../../src/proxy-mcp/jobs/dlq-triage';
import { JobQueue, JobStoreService, InMemoryJobStore } from '../../src/proxy-mcp/jobs';

describe('DLQ Triage', () => {
  describe('redactSensitiveData', () => {
    it('should redact GitHub personal access tokens', () => {
      const input = 'Error: ghp_1234567890abcdefghijklmnopqrstuvwxyz is invalid';
      const result = redactSensitiveData(input);
      expect(result).toContain('[REDACTED');
      expect(result).not.toContain('ghp_1234567890');
    });

    it('should redact OpenAI-style API keys', () => {
      const input = 'API error with sk-1234567890abcdefghijklmnopqrstuvwxyzABCD';
      const result = redactSensitiveData(input);
      expect(result).toContain('[REDACTED');
      expect(result).not.toContain('sk-1234567890');
    });

    it('should redact Slack tokens', () => {
      const input = 'Slack error: xoxb-123456789-abcdefghij';
      const result = redactSensitiveData(input);
      expect(result).toContain('[REDACTED_SLACK_BOT]');
      expect(result).not.toContain('xoxb-');
    });

    it('should redact database connection strings', () => {
      const input = 'DB error: postgresql://user:password123@localhost:5432/db';
      const result = redactSensitiveData(input);
      expect(result).toContain('[REDACTED_DB_DSN]');
      expect(result).not.toContain('password123');
    });

    it('should redact credential patterns', () => {
      const input = 'Auth failed: token=abc123def456ghi789';
      const result = redactSensitiveData(input);
      expect(result).toContain('[REDACTED_CREDENTIAL]');
    });

    it('should handle text without sensitive data', () => {
      const input = 'Connection timeout after 30s';
      const result = redactSensitiveData(input);
      expect(result).toBe(input);
    });
  });

  describe('generateTriageSummary', () => {
    let store: JobStoreService;
    let queue: JobQueue;

    beforeEach(async () => {
      store = new JobStoreService(new InMemoryJobStore());
      await store.init();
      queue = new JobQueue(store, { maxConcurrent: 2, maxQueueSize: 10 });
    });

    afterEach(async () => {
      queue.stop();
      await store.close();
    });

    it('should return empty summary when DLQ is empty', () => {
      const summary = generateTriageSummary(queue);

      expect(summary.totalCount).toBe(0);
      expect(summary.entries).toHaveLength(0);
      expect(summary.failureReasonSummary).toHaveLength(0);
    });

    it('should generate summary with DLQ entries', async () => {
      // Create and fail a job to DLQ
      const job = await store.createJob({
        entrypoint: 'test',
        params: { id: 1 },
        maxAttempts: 1,
      });
      await store.startJob(job.id);
      await queue.complete(job.id, false, 'Test failure');

      const summary = generateTriageSummary(queue);

      expect(summary.totalCount).toBe(1);
      expect(summary.entries).toHaveLength(1);
      expect(summary.entries[0].entrypoint).toBe('test');
      expect(summary.entries[0].reason).toBe('Test failure');
    });

    it('should aggregate failure reasons', async () => {
      // Create multiple jobs with same failure reason
      for (let i = 0; i < 3; i++) {
        const job = await store.createJob({
          entrypoint: 'test',
          params: { id: i },
          maxAttempts: 1,
        });
        await store.startJob(job.id);
        await queue.complete(job.id, false, 'Timeout error');
      }

      const summary = generateTriageSummary(queue);

      expect(summary.totalCount).toBe(3);
      expect(summary.failureReasonSummary).toHaveLength(1);
      expect(summary.failureReasonSummary[0].reason).toBe('Timeout error');
      expect(summary.failureReasonSummary[0].count).toBe(3);
    });

    it('should redact sensitive data in entries', async () => {
      const job = await store.createJob({
        entrypoint: 'test',
        params: {},
        maxAttempts: 1,
      });
      await store.startJob(job.id);
      await queue.complete(job.id, false, 'Failed: token=ghp_1234567890abcdefghijklmnopqrstuvwxyz');

      const summary = generateTriageSummary(queue);

      expect(summary.entries[0].reason).not.toContain('ghp_');
      expect(summary.entries[0].reason).toContain('[REDACTED');
    });

    it('should limit entries to 20', async () => {
      // Create 25 failed jobs
      for (let i = 0; i < 25; i++) {
        const job = await store.createJob({
          entrypoint: 'test',
          params: { id: i },
          maxAttempts: 1,
        });
        await store.startJob(job.id);
        await queue.complete(job.id, false, `Error ${i}`);
      }

      const summary = generateTriageSummary(queue);

      expect(summary.totalCount).toBe(25);
      expect(summary.entries.length).toBeLessThanOrEqual(20);
    });
  });

  describe('generateTriageIssueBody', () => {
    it('should generate valid issue body', () => {
      const summary: DLQTriageSummary = {
        totalCount: 5,
        entries: [
          {
            jobId: 'job_123456789_abcd',
            entrypoint: 'supervisor',
            reason: 'Timeout error',
            addedAt: '2024-01-15T10:00:00Z',
            attempts: 3,
          },
        ],
        failureReasonSummary: [{ reason: 'Timeout error', count: 5 }],
        oldestEntry: '2024-01-14T00:00:00Z',
        newestEntry: '2024-01-15T10:00:00Z',
      };

      const issue = generateTriageIssueBody(summary);

      expect(issue.title).toContain('5 jobs');
      expect(issue.body).toContain('## DLQ Triage Report');
      expect(issue.body).toContain('Total Jobs in DLQ:** 5');
      expect(issue.body).toContain('Timeout error');
      expect(issue.body).toContain('### Recommended Actions');
      expect(issue.labels).toContain('dlq-triage');
      expect(issue.labels).toContain('ops');
    });

    it('should include failure reasons table', () => {
      const summary: DLQTriageSummary = {
        totalCount: 10,
        entries: [],
        failureReasonSummary: [
          { reason: 'Timeout', count: 5 },
          { reason: 'Connection refused', count: 3 },
          { reason: 'Auth failed', count: 2 },
        ],
      };

      const issue = generateTriageIssueBody(summary);

      expect(issue.body).toContain('### Failure Reasons');
      expect(issue.body).toContain('| Timeout | 5 |');
      expect(issue.body).toContain('| Connection refused | 3 |');
    });
  });

  describe('formatTriageSummaryForConsole', () => {
    it('should format summary for console output', () => {
      const summary: DLQTriageSummary = {
        totalCount: 3,
        entries: [
          {
            jobId: 'job_123456789_abcd',
            entrypoint: 'test',
            reason: 'Connection timeout',
            addedAt: '2024-01-15T10:00:00Z',
            attempts: 2,
          },
        ],
        failureReasonSummary: [{ reason: 'Connection timeout', count: 3 }],
        oldestEntry: '2024-01-14T00:00:00Z',
        newestEntry: '2024-01-15T10:00:00Z',
      };

      const output = formatTriageSummaryForConsole(summary);

      expect(output).toContain('DLQ Triage Summary');
      expect(output).toContain('Total Jobs: 3');
      expect(output).toContain('Top Failure Reasons:');
      expect(output).toContain('3x Connection timeout');
      expect(output).toContain('Recent Entries:');
    });

    it('should handle empty summary', () => {
      const summary: DLQTriageSummary = {
        totalCount: 0,
        entries: [],
        failureReasonSummary: [],
      };

      const output = formatTriageSummaryForConsole(summary);

      expect(output).toContain('Total Jobs: 0');
    });
  });
});
