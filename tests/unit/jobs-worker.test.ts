/**
 * Job Worker Tests - P12
 */

// Jest - no import needed for describe, it, expect, beforeEach, afterEach (use jest instead of vi)
import { JobWorker, JobExecutor, createSupervisorExecutor } from '../../src/proxy-mcp/jobs/worker';
import { JobQueue } from '../../src/proxy-mcp/jobs/queue';
import { JobStoreService } from '../../src/proxy-mcp/jobs/store';

describe('JobWorker', () => {
  let store: JobStoreService;
  let queue: JobQueue;
  let worker: JobWorker;

  beforeEach(async () => {
    store = JobStoreService.fromConfig({ type: 'inmemory' });
    await store.init();
    queue = new JobQueue(store, {
      maxConcurrent: 5,
      maxQueueSize: 100,
      backpressureThreshold: 80,
      pollIntervalMs: 100,
    });
  });

  afterEach(async () => {
    await worker?.stop();
    await store.close();
  });

  describe('start/stop', () => {
    it('should start and stop worker', async () => {
      worker = new JobWorker(queue, store, { pollIntervalMs: 50 });

      const events: string[] = [];
      worker.on('started', () => events.push('started'));
      worker.on('stopped', () => events.push('stopped'));

      worker.start();
      expect(worker.isRunning()).toBe(true);

      await worker.stop();
      expect(worker.isRunning()).toBe(false);
      expect(events).toContain('started');
      expect(events).toContain('stopped');
    });

    it('should not start twice', () => {
      worker = new JobWorker(queue, store);
      worker.start();
      worker.start(); // Should be no-op
      expect(worker.isRunning()).toBe(true);
    });
  });

  describe('executeOnce', () => {
    it('should execute a single job', async () => {
      const executor: JobExecutor = jest.fn().mockResolvedValue({
        success: true,
        result: { success: true, summary: 'Test done' },
      });

      worker = new JobWorker(queue, store, {}, executor);

      const job = await store.createJob({
        entrypoint: 'test',
        params: { task: 'single-exec' },
      });

      const result = await worker.executeOnce(job.id);
      expect(result.success).toBe(true);
      expect(result.result?.summary).toBe('Test done');
      expect(executor).toHaveBeenCalledWith(
        expect.objectContaining({ id: job.id }),
        { dryRun: false }
      );
    });

    it('should return error for non-existent job', async () => {
      worker = new JobWorker(queue, store);

      const result = await worker.executeOnce('non-existent');
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should return error for non-queued job', async () => {
      worker = new JobWorker(queue, store);

      const job = await store.createJob({
        entrypoint: 'test',
        params: { task: 'status-test' },
      });
      await store.startJob(job.id);

      const result = await worker.executeOnce(job.id);
      expect(result.success).toBe(false);
      expect(result.error).toContain('not queued');
    });
  });

  describe('dry-run mode', () => {
    it('should pass dryRun flag to executor', async () => {
      const executor: JobExecutor = jest.fn().mockImplementation((job, options) => {
        // Executor should receive dryRun=true
        if (options.dryRun) {
          return Promise.resolve({
            success: true,
            result: { success: true, summary: '[DRY-RUN] Skipped' },
          });
        }
        return Promise.resolve({
          success: true,
          result: { success: true, summary: 'Executed' },
        });
      });

      worker = new JobWorker(queue, store, { dryRun: true }, executor);

      const job = await store.createJob({
        entrypoint: 'test',
        params: { task: 'dry-run-test' },
      });

      const result = await worker.executeOnce(job.id);
      expect(result.success).toBe(true);
      expect(result.result?.summary).toContain('DRY-RUN');
      expect(executor).toHaveBeenCalledWith(
        expect.objectContaining({ id: job.id }),
        { dryRun: true }
      );
    });

    it('should use defaultExecutor dry-run behavior', async () => {
      // Use default executor (no custom executor provided)
      worker = new JobWorker(queue, store, { dryRun: true });

      const job = await store.createJob({
        entrypoint: 'test',
        params: { task: 'default-dry-run' },
      });

      const result = await worker.executeOnce(job.id);
      expect(result.success).toBe(true);
      expect(result.result?.summary).toContain('DRY-RUN');
      expect(result.result?.data).toEqual({ dryRun: true, params: job.params });
    });
  });

  describe('approval handling', () => {
    it('should handle jobs needing approval', async () => {
      const executor: JobExecutor = jest.fn().mockResolvedValue({
        success: true,
        needsApproval: 123,
      });

      worker = new JobWorker(queue, store, {}, executor);

      const job = await store.createJob({
        entrypoint: 'test',
        params: { task: 'approval-test' },
      });

      const result = await worker.executeOnce(job.id);
      expect(result.needsApproval).toBe(123);

      const updated = await store.getJob(job.id);
      expect(updated?.status).toBe('waiting_approval');
      expect(updated?.issueId).toBe(123);
    });
  });

  describe('error handling', () => {
    it('should handle executor errors', async () => {
      const executor: JobExecutor = jest.fn().mockRejectedValue(new Error('Executor failed'));

      worker = new JobWorker(queue, store, {}, executor);

      const job = await store.createJob({
        entrypoint: 'test',
        params: { task: 'error-test' },
      });

      const result = await worker.executeOnce(job.id);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Executor failed');

      const updated = await store.getJob(job.id);
      expect(updated?.status).toBe('failed');
    });

    it('should handle executor returning failure', async () => {
      const executor: JobExecutor = jest.fn().mockResolvedValue({
        success: false,
        error: 'Task failed',
      });

      worker = new JobWorker(queue, store, {}, executor);

      const job = await store.createJob({
        entrypoint: 'test',
        params: { task: 'failure-test' },
      });

      const result = await worker.executeOnce(job.id);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Task failed');
    });
  });

  describe('getStats', () => {
    it('should track worker statistics', async () => {
      const executor: JobExecutor = jest.fn().mockResolvedValue({
        success: true,
        result: { success: true, summary: 'Done' },
      });

      worker = new JobWorker(queue, store, { workerId: 'test-worker' }, executor);

      const job1 = await store.createJob({
        entrypoint: 'test',
        params: { task: 'stats-1' },
      });
      const job2 = await store.createJob({
        entrypoint: 'test',
        params: { task: 'stats-2' },
      });

      await worker.executeOnce(job1.id);
      await worker.executeOnce(job2.id);

      const stats = worker.getStats();
      expect(stats.processed).toBe(0); // executeOnce doesn't increment processed
      expect(stats.succeeded).toBe(0); // executeOnce doesn't increment succeeded
    });

    it('should return correct worker ID', () => {
      worker = new JobWorker(queue, store, { workerId: 'custom-worker' });
      expect(worker.getWorkerId()).toBe('custom-worker');
    });
  });

  describe('polling', () => {
    it('should process jobs via polling', async () => {
      const executor: JobExecutor = jest.fn().mockResolvedValue({
        success: true,
        result: { success: true, summary: 'Polled' },
      });

      worker = new JobWorker(queue, store, { pollIntervalMs: 50 }, executor);

      await store.createJob({
        entrypoint: 'test',
        params: { task: 'poll-test' },
      });

      worker.start();

      // Wait for poll
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(executor).toHaveBeenCalled();
      const stats = worker.getStats();
      expect(stats.processed).toBeGreaterThan(0);
    });

    it('should emit events during processing', async () => {
      const events: string[] = [];
      const executor: JobExecutor = jest.fn().mockResolvedValue({
        success: true,
        result: { success: true, summary: 'Events' },
      });

      worker = new JobWorker(queue, store, { pollIntervalMs: 50 }, executor);
      worker.on('job:processing', () => events.push('processing'));
      worker.on('job:succeeded', () => events.push('succeeded'));

      await store.createJob({
        entrypoint: 'test',
        params: { task: 'event-test' },
      });

      worker.start();

      // Wait for poll
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(events).toContain('processing');
      expect(events).toContain('succeeded');
    });
  });
});

describe('createSupervisorExecutor', () => {
  it('should create a supervisor executor', async () => {
    const supervisorRunner = jest.fn().mockResolvedValue({
      success: true,
      summary: 'Supervisor done',
      refId: 'ref-123',
    });

    const executor = createSupervisorExecutor(supervisorRunner);

    const job = {
      id: 'job_test',
      jobKey: 'test:key',
      status: 'running' as const,
      priority: 'normal' as const,
      entrypoint: 'supervisor',
      params: { task: 'supervisor-test' },
      planHash: 'abc123',
      attempts: 1,
      maxAttempts: 3,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const result = await executor(job, { dryRun: false });

    expect(result.success).toBe(true);
    expect(result.result?.summary).toBe('Supervisor done');
    expect(result.result?.refId).toBe('ref-123');
    expect(supervisorRunner).toHaveBeenCalledWith(job.params, job.planHash);
  });

  it('should handle supervisor returning issueId (needs approval)', async () => {
    const supervisorRunner = jest.fn().mockResolvedValue({
      success: true,
      summary: 'Needs approval',
      issueId: 456,
    });

    const executor = createSupervisorExecutor(supervisorRunner);

    const job = {
      id: 'job_approval',
      jobKey: 'test:approval',
      status: 'running' as const,
      priority: 'normal' as const,
      entrypoint: 'supervisor',
      params: { task: 'approval-test' },
      attempts: 1,
      maxAttempts: 3,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const result = await executor(job, { dryRun: false });

    expect(result.success).toBe(true);
    expect(result.needsApproval).toBe(456);
  });

  it('should skip in dry-run mode', async () => {
    const supervisorRunner = jest.fn();

    const executor = createSupervisorExecutor(supervisorRunner);

    const job = {
      id: 'job_dryrun',
      jobKey: 'test:dryrun',
      status: 'running' as const,
      priority: 'normal' as const,
      entrypoint: 'supervisor',
      params: { task: 'dry-test' },
      planHash: 'xyz789',
      attempts: 1,
      maxAttempts: 3,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const result = await executor(job, { dryRun: true });

    expect(result.success).toBe(true);
    expect(result.result?.summary).toContain('DRY-RUN');
    expect(supervisorRunner).not.toHaveBeenCalled();
  });

  it('should handle supervisor errors', async () => {
    const supervisorRunner = jest.fn().mockRejectedValue(new Error('Supervisor error'));

    const executor = createSupervisorExecutor(supervisorRunner);

    const job = {
      id: 'job_error',
      jobKey: 'test:error',
      status: 'running' as const,
      priority: 'normal' as const,
      entrypoint: 'supervisor',
      params: { task: 'error-test' },
      attempts: 1,
      maxAttempts: 3,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const result = await executor(job, { dryRun: false });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Supervisor error');
  });
});
