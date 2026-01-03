/**
 * Job Store Tests - P12
 */

import * as fs from 'fs';
import * as path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  JobStoreService,
  generateJobId,
  generateJobKey,
  InMemoryJobStore,
  JsonlJobStore,
} from '../../src/proxy-mcp/jobs';
import type { Job, JobStoreAdapter } from '../../src/proxy-mcp/jobs';

describe('generateJobId', () => {
  it('should generate unique job IDs', () => {
    const id1 = generateJobId();
    const id2 = generateJobId();
    expect(id1).toMatch(/^job_\d+_[a-f0-9]{8}$/);
    expect(id2).toMatch(/^job_\d+_[a-f0-9]{8}$/);
    expect(id1).not.toBe(id2);
  });
});

describe('generateJobKey', () => {
  it('should generate consistent job keys', () => {
    const key1 = generateJobKey('supervisor', { task: 'test' });
    const key2 = generateJobKey('supervisor', { task: 'test' });
    expect(key1).toBe(key2);
  });

  it('should include planHash when provided', () => {
    const keyWithoutHash = generateJobKey('supervisor', { task: 'test' });
    const keyWithHash = generateJobKey('supervisor', { task: 'test' }, 'abc123');
    expect(keyWithoutHash).not.toBe(keyWithHash);
    expect(keyWithHash).toContain('abc123');
  });

  it('should produce different keys for different params', () => {
    const key1 = generateJobKey('supervisor', { task: 'test1' });
    const key2 = generateJobKey('supervisor', { task: 'test2' });
    expect(key1).not.toBe(key2);
  });
});

describe('InMemoryJobStore', () => {
  let store: InMemoryJobStore;

  beforeEach(async () => {
    store = new InMemoryJobStore();
    await store.init();
  });

  afterEach(async () => {
    await store.close();
  });

  runStoreTests(() => store);
});

describe('JsonlJobStore', () => {
  let store: JsonlJobStore;
  const testFilePath = path.join(__dirname, '../fixtures/test-jobs.jsonl');

  beforeEach(async () => {
    // Clean up test file
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
    store = new JsonlJobStore(testFilePath, 0); // Disable auto-save for tests
    await store.init();
  });

  afterEach(async () => {
    await store.close();
    // Clean up test file
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
  });

  runStoreTests(() => store);

  it('should persist jobs to file', async () => {
    const job = createTestJob('test-persist');
    await store.create(job);
    await store.forceSave();

    // Verify file exists
    expect(fs.existsSync(testFilePath)).toBe(true);

    // Reload and verify
    const newStore = new JsonlJobStore(testFilePath, 0);
    await newStore.init();
    const loaded = await newStore.get(job.id);
    expect(loaded).not.toBeNull();
    expect(loaded?.id).toBe(job.id);
    await newStore.close();
  });
});

describe('JobStoreService', () => {
  let service: JobStoreService;

  beforeEach(async () => {
    service = JobStoreService.fromConfig({ type: 'inmemory' });
    await service.init();
  });

  afterEach(async () => {
    await service.close();
  });

  describe('createJob', () => {
    it('should create a new job', async () => {
      const job = await service.createJob({
        entrypoint: 'supervisor',
        params: { task: 'test' },
      });

      expect(job.id).toMatch(/^job_/);
      expect(job.status).toBe('queued');
      expect(job.priority).toBe('normal');
      expect(job.attempts).toBe(0);
      expect(job.maxAttempts).toBe(3);
    });

    it('should return existing job if active (idempotency)', async () => {
      const job1 = await service.createJob({
        entrypoint: 'supervisor',
        params: { task: 'test' },
      });

      const job2 = await service.createJob({
        entrypoint: 'supervisor',
        params: { task: 'test' },
      });

      expect(job1.id).toBe(job2.id);
    });

    it('should allow new job if previous completed', async () => {
      const job1 = await service.createJob({
        entrypoint: 'supervisor',
        params: { task: 'test' },
      });

      await service.succeedJob(job1.id, {
        success: true,
        summary: 'Done',
      });

      const job2 = await service.createJob({
        entrypoint: 'supervisor',
        params: { task: 'test' },
      });

      expect(job1.id).not.toBe(job2.id);
    });

    it('should respect priority', async () => {
      const job = await service.createJob({
        entrypoint: 'supervisor',
        params: { task: 'test' },
        priority: 'high',
      });

      expect(job.priority).toBe('high');
    });
  });

  describe('startJob', () => {
    it('should mark job as running and increment attempts', async () => {
      const job = await service.createJob({
        entrypoint: 'supervisor',
        params: { task: 'test' },
      });

      const started = await service.startJob(job.id);
      expect(started?.status).toBe('running');
      expect(started?.attempts).toBe(1);
      expect(started?.startedAt).toBeDefined();
    });
  });

  describe('waitForApproval', () => {
    it('should mark job as waiting_approval with issueId', async () => {
      const job = await service.createJob({
        entrypoint: 'supervisor',
        params: { task: 'test' },
      });

      const waiting = await service.waitForApproval(job.id, 123);
      expect(waiting?.status).toBe('waiting_approval');
      expect(waiting?.issueId).toBe(123);
    });
  });

  describe('succeedJob', () => {
    it('should mark job as succeeded with result', async () => {
      const job = await service.createJob({
        entrypoint: 'supervisor',
        params: { task: 'test' },
      });

      const result = { success: true, summary: 'Test completed', refId: 'ref-123' };
      const succeeded = await service.succeedJob(job.id, result);

      expect(succeeded?.status).toBe('succeeded');
      expect(succeeded?.result).toEqual(result);
      expect(succeeded?.completedAt).toBeDefined();
    });
  });

  describe('failJob', () => {
    it('should mark job as failed with error', async () => {
      const job = await service.createJob({
        entrypoint: 'supervisor',
        params: { task: 'test' },
      });

      const failed = await service.failJob(job.id, 'Test error');
      expect(failed?.status).toBe('failed');
      expect(failed?.lastError).toBe('Test error');
      expect(failed?.completedAt).toBeDefined();
    });
  });

  describe('cancelJob', () => {
    it('should mark job as canceled', async () => {
      const job = await service.createJob({
        entrypoint: 'supervisor',
        params: { task: 'test' },
      });

      const canceled = await service.cancelJob(job.id, 'User canceled');
      expect(canceled?.status).toBe('canceled');
      expect(canceled?.lastError).toBe('User canceled');
      expect(canceled?.completedAt).toBeDefined();
    });
  });

  describe('getStats', () => {
    it('should return correct job statistics', async () => {
      // Create jobs in different states
      const job1 = await service.createJob({
        entrypoint: 'supervisor',
        params: { task: 'test1' },
      });
      const job2 = await service.createJob({
        entrypoint: 'supervisor',
        params: { task: 'test2' },
      });
      const job3 = await service.createJob({
        entrypoint: 'supervisor',
        params: { task: 'test3' },
      });

      await service.startJob(job2.id);
      await service.succeedJob(job3.id, { success: true, summary: 'Done' });

      const stats = await service.getStats();
      expect(stats.queued).toBe(1);
      expect(stats.running).toBe(1);
      expect(stats.succeeded).toBe(1);
      expect(stats.total).toBe(3);
    });
  });

  describe('hasExceededMaxAttempts', () => {
    it('should return true when max attempts exceeded', async () => {
      const job = await service.createJob({
        entrypoint: 'supervisor',
        params: { task: 'test' },
        maxAttempts: 2,
      });

      await service.startJob(job.id);
      await service.startJob(job.id);

      const exceeded = await service.hasExceededMaxAttempts(job.id);
      expect(exceeded).toBe(true);
    });

    it('should return false when attempts remain', async () => {
      const job = await service.createJob({
        entrypoint: 'supervisor',
        params: { task: 'test' },
        maxAttempts: 3,
      });

      await service.startJob(job.id);

      const exceeded = await service.hasExceededMaxAttempts(job.id);
      expect(exceeded).toBe(false);
    });
  });

  describe('getQueuedJobs', () => {
    it('should return jobs ordered by priority and creation time', async () => {
      const job1 = await service.createJob({
        entrypoint: 'supervisor',
        params: { task: 'low' },
        priority: 'low',
      });

      const job2 = await service.createJob({
        entrypoint: 'supervisor',
        params: { task: 'critical' },
        priority: 'critical',
      });

      const job3 = await service.createJob({
        entrypoint: 'supervisor',
        params: { task: 'high' },
        priority: 'high',
      });

      const queued = await service.getQueuedJobs();
      expect(queued[0].id).toBe(job2.id); // critical first
      expect(queued[1].id).toBe(job3.id); // high second
      expect(queued[2].id).toBe(job1.id); // low last
    });
  });
});

// Shared store tests
function runStoreTests(getStore: () => JobStoreAdapter) {
  describe('basic operations', () => {
    it('should create and get a job', async () => {
      const store = getStore();
      const job = createTestJob('test-1');

      const created = await store.create(job);
      expect(created.id).toBe(job.id);

      const retrieved = await store.get(job.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(job.id);
    });

    it('should get job by key', async () => {
      const store = getStore();
      const job = createTestJob('test-2');

      await store.create(job);

      const retrieved = await store.getByKey(job.jobKey);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(job.id);
    });

    it('should update a job', async () => {
      const store = getStore();
      const job = createTestJob('test-3');

      await store.create(job);

      const updated = await store.update(job.id, { status: 'running' });
      expect(updated?.status).toBe('running');
      expect(updated?.updatedAt).toBeDefined();
      // updatedAt should be set (may or may not differ depending on timing)
      expect(new Date(updated!.updatedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(job.updatedAt).getTime()
      );
    });

    it('should delete a job', async () => {
      const store = getStore();
      const job = createTestJob('test-4');

      await store.create(job);
      const deleted = await store.delete(job.id);
      expect(deleted).toBe(true);

      const retrieved = await store.get(job.id);
      expect(retrieved).toBeNull();
    });

    it('should return null for non-existent job', async () => {
      const store = getStore();
      const retrieved = await store.get('non-existent');
      expect(retrieved).toBeNull();
    });

    it('should throw on duplicate job key', async () => {
      const store = getStore();
      const job1 = createTestJob('test-dup');
      const job2 = createTestJob('test-dup');
      job2.id = 'different-id';

      await store.create(job1);
      await expect(store.create(job2)).rejects.toThrow(/already exists/);
    });
  });

  describe('listByStatus', () => {
    it('should list jobs by status', async () => {
      const store = getStore();
      const job1 = createTestJob('list-1', { status: 'queued' });
      const job2 = createTestJob('list-2', { status: 'running' });
      const job3 = createTestJob('list-3', { status: 'queued' });

      await store.create(job1);
      await store.create(job2);
      await store.create(job3);

      const queued = await store.listByStatus('queued');
      expect(queued).toHaveLength(2);
      expect(queued.every((j) => j.status === 'queued')).toBe(true);
    });

    it('should order by priority then creation time', async () => {
      const store = getStore();
      const job1 = createTestJob('priority-1', {
        status: 'queued',
        priority: 'low',
      });
      const job2 = createTestJob('priority-2', {
        status: 'queued',
        priority: 'critical',
      });
      const job3 = createTestJob('priority-3', {
        status: 'queued',
        priority: 'high',
      });

      await store.create(job1);
      await store.create(job2);
      await store.create(job3);

      const queued = await store.listByStatus('queued');
      expect(queued[0].priority).toBe('critical');
      expect(queued[1].priority).toBe('high');
      expect(queued[2].priority).toBe('low');
    });

    it('should respect limit', async () => {
      const store = getStore();
      for (let i = 0; i < 10; i++) {
        await store.create(createTestJob(`limit-${i}`));
      }

      const limited = await store.listByStatus('queued', 5);
      expect(limited).toHaveLength(5);
    });
  });

  describe('countByStatus', () => {
    it('should count jobs by status', async () => {
      const store = getStore();
      await store.create(createTestJob('count-1', { status: 'queued' }));
      await store.create(createTestJob('count-2', { status: 'queued' }));
      await store.create(createTestJob('count-3', { status: 'running' }));

      const queuedCount = await store.countByStatus('queued');
      const runningCount = await store.countByStatus('running');

      expect(queuedCount).toBe(2);
      expect(runningCount).toBe(1);
    });
  });

  describe('getExpiringApprovals', () => {
    it('should return jobs with expiring approvals', async () => {
      const store = getStore();
      const now = Date.now();

      // Job expiring in 30 minutes
      const expiringJob = createTestJob('expiring', {
        status: 'waiting_approval',
        approvalExpiresAt: new Date(now + 30 * 60 * 1000).toISOString(),
      });

      // Job expiring in 2 hours
      const laterJob = createTestJob('later', {
        status: 'waiting_approval',
        approvalExpiresAt: new Date(now + 2 * 60 * 60 * 1000).toISOString(),
      });

      await store.create(expiringJob);
      await store.create(laterJob);

      // 1 hour threshold
      const expiring = await store.getExpiringApprovals(60 * 60 * 1000);
      expect(expiring).toHaveLength(1);
      expect(expiring[0].id).toBe(expiringJob.id);
    });
  });
}

// Helper to create test jobs
function createTestJob(
  suffix: string,
  overrides: Partial<Job> = {}
): Job {
  const now = new Date().toISOString();
  return {
    id: `job_test_${suffix}`,
    jobKey: `test:${suffix}`,
    status: 'queued',
    priority: 'normal',
    entrypoint: 'test',
    params: { suffix },
    attempts: 0,
    maxAttempts: 3,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
