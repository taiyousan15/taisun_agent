/**
 * Job Queue Tests - P12
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { JobQueue } from '../../src/proxy-mcp/jobs/queue';
import { JobStoreService } from '../../src/proxy-mcp/jobs/store';
import type { Job } from '../../src/proxy-mcp/jobs/types';

describe('JobQueue', () => {
  let store: JobStoreService;
  let queue: JobQueue;

  beforeEach(async () => {
    store = JobStoreService.fromConfig({ type: 'inmemory' });
    await store.init();
    queue = new JobQueue(store, {
      maxConcurrent: 2,
      maxQueueSize: 10,
      backpressureThreshold: 80,
      pollIntervalMs: 100,
    });
  });

  afterEach(async () => {
    queue.stop();
    await store.close();
  });

  describe('submit', () => {
    it('should accept a job', async () => {
      const job = await store.createJob({
        entrypoint: 'test',
        params: { task: 'submit-test' },
      });

      const result = await queue.submit(job);
      expect(result.accepted).toBe(true);
    });

    it('should reject when queue is full', async () => {
      // Fill the queue
      for (let i = 0; i < 10; i++) {
        await store.createJob({
          entrypoint: 'test',
          params: { task: `fill-${i}` },
        });
      }

      const extraJob = await store.createJob({
        entrypoint: 'test',
        params: { task: 'extra' },
      });

      const result = await queue.submit(extraJob);
      expect(result.accepted).toBe(false);
      expect(result.reason).toContain('full');
    });
  });

  describe('getNext', () => {
    it('should get next queued job', async () => {
      const job = await store.createJob({
        entrypoint: 'test',
        params: { task: 'next-test' },
      });

      queue.start();
      const next = await queue.getNext();

      expect(next).not.toBeNull();
      expect(next?.id).toBe(job.id);
      expect(next?.status).toBe('running');
    });

    it('should return null when queue is empty', async () => {
      queue.start();
      const next = await queue.getNext();
      expect(next).toBeNull();
    });

    it('should respect maxConcurrent limit', async () => {
      await store.createJob({ entrypoint: 'test', params: { task: '1' } });
      await store.createJob({ entrypoint: 'test', params: { task: '2' } });
      await store.createJob({ entrypoint: 'test', params: { task: '3' } });

      queue.start();
      const job1 = await queue.getNext();
      const job2 = await queue.getNext();
      const job3 = await queue.getNext();

      expect(job1).not.toBeNull();
      expect(job2).not.toBeNull();
      expect(job3).toBeNull(); // Should be blocked by maxConcurrent=2
    });

    it('should respect priority order', async () => {
      const low = await store.createJob({
        entrypoint: 'test',
        params: { task: 'low' },
        priority: 'low',
      });
      const high = await store.createJob({
        entrypoint: 'test',
        params: { task: 'high' },
        priority: 'high',
      });
      const critical = await store.createJob({
        entrypoint: 'test',
        params: { task: 'critical' },
        priority: 'critical',
      });

      queue.start();
      const first = await queue.getNext();
      const second = await queue.getNext();

      expect(first?.id).toBe(critical.id);
      expect(second?.id).toBe(high.id);
    });
  });

  describe('complete', () => {
    it('should mark job as succeeded', async () => {
      const job = await store.createJob({
        entrypoint: 'test',
        params: { task: 'complete-test' },
      });

      queue.start();
      const started = await queue.getNext();
      expect(started).not.toBeNull();

      await queue.complete(job.id, true, { success: true, summary: 'Done' });

      const completed = await store.getJob(job.id);
      expect(completed?.status).toBe('succeeded');
    });

    it('should requeue job on failure if retries remain', async () => {
      const job = await store.createJob({
        entrypoint: 'test',
        params: { task: 'retry-test' },
        maxAttempts: 3,
      });

      queue.start();
      await queue.getNext();

      await queue.complete(job.id, false, 'Test error');

      const updated = await store.getJob(job.id);
      expect(updated?.status).toBe('queued');
      expect(updated?.lastError).toBe('Test error');
    });

    it('should move job to DLQ when max attempts exceeded', async () => {
      const job = await store.createJob({
        entrypoint: 'test',
        params: { task: 'dlq-test' },
        maxAttempts: 1,
      });

      queue.start();
      await queue.getNext();

      await queue.complete(job.id, false, 'Final error');

      const dlq = queue.getDLQ();
      expect(dlq).toHaveLength(1);
      expect(dlq[0].job.id).toBe(job.id);
      expect(dlq[0].reason).toBe('Final error');
    });
  });

  describe('waitForApproval', () => {
    it('should put job on hold for approval', async () => {
      const job = await store.createJob({
        entrypoint: 'test',
        params: { task: 'approval-test' },
      });

      queue.start();
      await queue.getNext();

      await queue.waitForApproval(job.id, 123);

      const updated = await store.getJob(job.id);
      expect(updated?.status).toBe('waiting_approval');
      expect(updated?.issueId).toBe(123);
      expect(queue.getRunningJobs()).not.toContain(job.id);
    });
  });

  describe('resume', () => {
    it('should resume job after approval', async () => {
      const job = await store.createJob({
        entrypoint: 'test',
        params: { task: 'resume-test' },
      });

      queue.start();
      await queue.getNext();
      await queue.waitForApproval(job.id, 123);

      const resumed = await queue.resume(job.id);
      expect(resumed).not.toBeNull();

      const updated = await store.getJob(job.id);
      expect(updated?.status).toBe('queued');
    });

    it('should return null for non-waiting job', async () => {
      const job = await store.createJob({
        entrypoint: 'test',
        params: { task: 'no-resume' },
      });

      const resumed = await queue.resume(job.id);
      expect(resumed).toBeNull();
    });
  });

  describe('cancel', () => {
    it('should cancel a running job', async () => {
      const job = await store.createJob({
        entrypoint: 'test',
        params: { task: 'cancel-test' },
      });

      queue.start();
      await queue.getNext();

      await queue.cancel(job.id, 'User requested');

      const updated = await store.getJob(job.id);
      expect(updated?.status).toBe('canceled');
      expect(updated?.lastError).toBe('User requested');
      expect(queue.getRunningJobs()).not.toContain(job.id);
    });
  });

  describe('backpressure', () => {
    it('should activate backpressure at threshold', async () => {
      // maxQueueSize=10, threshold=80% => 8 concurrent triggers backpressure
      // But maxConcurrent=2, so we need different config
      const bpQueue = new JobQueue(
        store,
        {
          maxConcurrent: 10,
          maxQueueSize: 10,
          backpressureThreshold: 30, // 30% of 10 = 3
          pollIntervalMs: 100,
        }
      );

      // Start 3 jobs to trigger backpressure
      await store.createJob({ entrypoint: 'test', params: { task: 'bp-1' } });
      await store.createJob({ entrypoint: 'test', params: { task: 'bp-2' } });
      await store.createJob({ entrypoint: 'test', params: { task: 'bp-3' } });

      bpQueue.start();
      await bpQueue.getNext();
      await bpQueue.getNext();
      await bpQueue.getNext();

      expect(bpQueue.isBackpressureActive()).toBe(true);

      bpQueue.stop();
    });
  });

  describe('DLQ', () => {
    it('should add failed jobs to DLQ', async () => {
      const job = await store.createJob({
        entrypoint: 'test',
        params: { task: 'dlq-add' },
        maxAttempts: 1,
      });

      queue.start();
      await queue.getNext();
      await queue.complete(job.id, false, 'Error');

      const dlq = queue.getDLQ();
      expect(dlq).toHaveLength(1);
    });

    it('should clear DLQ', async () => {
      const job = await store.createJob({
        entrypoint: 'test',
        params: { task: 'dlq-clear' },
        maxAttempts: 1,
      });

      queue.start();
      await queue.getNext();
      await queue.complete(job.id, false, 'Error');

      queue.clearDLQ();
      expect(queue.getDLQ()).toHaveLength(0);
    });

    it('should retry job from DLQ', async () => {
      const job = await store.createJob({
        entrypoint: 'test',
        params: { task: 'dlq-retry' },
        maxAttempts: 1,
      });

      queue.start();
      await queue.getNext();
      await queue.complete(job.id, false, 'Error');

      const newJob = await queue.retryFromDLQ(job.id);
      expect(newJob).not.toBeNull();
      expect(newJob?.status).toBe('queued');
      expect(queue.getDLQ()).toHaveLength(0);
    });

    it('should clean expired DLQ entries', async () => {
      // Create a queue with short retention
      const shortRetentionQueue = new JobQueue(
        store,
        { maxConcurrent: 2, maxQueueSize: 10, backpressureThreshold: 80, pollIntervalMs: 100 },
        { enabled: true, maxSize: 100, retentionDays: 0 } // 0 days = immediate expiry
      );

      const job = await store.createJob({
        entrypoint: 'test',
        params: { task: 'dlq-expire' },
        maxAttempts: 1,
      });

      shortRetentionQueue.start();
      await shortRetentionQueue.getNext();
      await shortRetentionQueue.complete(job.id, false, 'Error');

      expect(shortRetentionQueue.getDLQ()).toHaveLength(1);

      const removed = shortRetentionQueue.cleanExpiredDLQ();
      expect(removed).toBe(1);
      expect(shortRetentionQueue.getDLQ()).toHaveLength(0);

      shortRetentionQueue.stop();
    });
  });

  describe('getStats', () => {
    it('should return accurate statistics', async () => {
      await store.createJob({ entrypoint: 'test', params: { task: 'stat-1' } });
      await store.createJob({ entrypoint: 'test', params: { task: 'stat-2' } });

      queue.start();
      await queue.getNext();

      const stats = await queue.getStats();
      expect(stats.queued).toBe(1);
      expect(stats.running).toBe(1);
      expect(stats.dlq).toBe(0);
      expect(stats.utilizationPercent).toBe(10); // 1/10 = 10%
    });
  });

  describe('events', () => {
    it('should emit events', async () => {
      const events: string[] = [];

      queue.on('started', () => events.push('started'));
      queue.on('job:started', () => events.push('job:started'));
      queue.on('job:succeeded', () => events.push('job:succeeded'));
      queue.on('stopped', () => events.push('stopped'));

      queue.start();

      const job = await store.createJob({
        entrypoint: 'test',
        params: { task: 'event-test' },
      });

      await queue.getNext();
      await queue.complete(job.id, true, { success: true, summary: 'Done' });

      queue.stop();

      expect(events).toContain('started');
      expect(events).toContain('job:started');
      expect(events).toContain('job:succeeded');
      expect(events).toContain('stopped');
    });
  });
});
