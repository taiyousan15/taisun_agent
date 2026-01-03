/**
 * Job Queue - P12
 *
 * Flow control with backpressure and dead-letter queue.
 */

import { EventEmitter } from 'events';
import { Job, JobStatus } from './types';
import { JobStoreService } from './store';

/**
 * Queue configuration
 */
export interface QueueConfig {
  /** Maximum concurrent jobs */
  maxConcurrent: number;
  /** Maximum queue size */
  maxQueueSize: number;
  /** Backpressure threshold (percentage of maxQueueSize) */
  backpressureThreshold: number;
  /** Poll interval in ms */
  pollIntervalMs: number;
}

/**
 * DLQ configuration
 */
export interface DLQConfig {
  /** Enable DLQ */
  enabled: boolean;
  /** Maximum DLQ size */
  maxSize: number;
  /** Retention in days */
  retentionDays: number;
}

/**
 * Queue statistics
 */
export interface QueueStats {
  /** Number of queued jobs */
  queued: number;
  /** Number of running jobs */
  running: number;
  /** Number of jobs in DLQ */
  dlq: number;
  /** Is backpressure active */
  backpressureActive: boolean;
  /** Queue utilization percentage */
  utilizationPercent: number;
}

/**
 * Dead Letter Queue entry
 */
export interface DLQEntry {
  job: Job;
  reason: string;
  addedAt: string;
}

/**
 * Job Queue with backpressure and DLQ
 */
export class JobQueue extends EventEmitter {
  private store: JobStoreService;
  private config: QueueConfig;
  private dlqConfig: DLQConfig;
  private dlq: DLQEntry[] = [];
  private running: Set<string> = new Set();
  private pollTimer: NodeJS.Timeout | null = null;
  private started: boolean = false;

  constructor(
    store: JobStoreService,
    config: Partial<QueueConfig> = {},
    dlqConfig: Partial<DLQConfig> = {}
  ) {
    super();
    this.store = store;
    this.config = {
      maxConcurrent: config.maxConcurrent ?? 3,
      maxQueueSize: config.maxQueueSize ?? 100,
      backpressureThreshold: config.backpressureThreshold ?? 80,
      pollIntervalMs: config.pollIntervalMs ?? 1000,
    };
    this.dlqConfig = {
      enabled: dlqConfig.enabled ?? true,
      maxSize: dlqConfig.maxSize ?? 1000,
      retentionDays: dlqConfig.retentionDays ?? 30,
    };
  }

  /**
   * Start the queue
   */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.emit('started');
  }

  /**
   * Stop the queue
   */
  stop(): void {
    if (!this.started) return;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.started = false;
    this.emit('stopped');
  }

  /**
   * Submit a job to the queue
   */
  async submit(job: Job): Promise<{ accepted: boolean; reason?: string }> {
    // Check backpressure
    if (this.isBackpressureActive()) {
      return {
        accepted: false,
        reason: 'Queue is under backpressure',
      };
    }

    // Check queue size limit
    const stats = await this.store.getStats();
    if (stats.queued >= this.config.maxQueueSize) {
      return {
        accepted: false,
        reason: 'Queue is full',
      };
    }

    this.emit('job:submitted', job);
    return { accepted: true };
  }

  /**
   * Get next job from queue (FIFO with priority)
   */
  async getNext(): Promise<Job | null> {
    // Check concurrent limit
    if (this.running.size >= this.config.maxConcurrent) {
      return null;
    }

    // Get next queued job (priority ordered)
    const jobs = await this.store.getQueuedJobs(1);
    if (jobs.length === 0) {
      return null;
    }

    const job = jobs[0];

    // Check max attempts
    if (await this.store.hasExceededMaxAttempts(job.id)) {
      await this.moveToDLQ(job, 'Max attempts exceeded');
      return this.getNext(); // Try next job
    }

    // Mark as running
    const started = await this.store.startJob(job.id);
    if (!started) {
      return null;
    }

    this.running.add(job.id);
    this.emit('job:started', started);

    return started;
  }

  /**
   * Mark job as complete
   */
  async complete(jobId: string, success: boolean, resultOrError: unknown): Promise<void> {
    this.running.delete(jobId);

    if (success) {
      const result =
        typeof resultOrError === 'object' && resultOrError !== null
          ? (resultOrError as { success: boolean; summary: string; refId?: string })
          : { success: true, summary: String(resultOrError) };
      await this.store.succeedJob(jobId, result);
      this.emit('job:succeeded', jobId);
    } else {
      const error = typeof resultOrError === 'string' ? resultOrError : String(resultOrError);
      const job = await this.store.getJob(jobId);

      if (job && job.attempts >= job.maxAttempts) {
        await this.moveToDLQ(job, error);
      } else {
        // Requeue for retry
        await this.store.updateStatus(jobId, 'queued', error);
        this.emit('job:retrying', jobId);
      }
    }
  }

  /**
   * Put job on hold for approval
   */
  async waitForApproval(jobId: string, issueId: number): Promise<void> {
    this.running.delete(jobId);
    await this.store.waitForApproval(jobId, issueId);
    this.emit('job:waiting_approval', jobId, issueId);
  }

  /**
   * Resume job after approval
   */
  async resume(jobId: string): Promise<Job | null> {
    const job = await this.store.getJob(jobId);
    if (!job || job.status !== 'waiting_approval') {
      return null;
    }

    await this.store.updateStatus(jobId, 'queued');
    this.emit('job:resumed', jobId);

    return job;
  }

  /**
   * Cancel a job
   */
  async cancel(jobId: string, reason?: string): Promise<void> {
    this.running.delete(jobId);
    await this.store.cancelJob(jobId, reason);
    this.emit('job:canceled', jobId);
  }

  /**
   * Check if backpressure is active
   */
  isBackpressureActive(): boolean {
    const threshold = Math.floor(
      (this.config.maxQueueSize * this.config.backpressureThreshold) / 100
    );
    return this.running.size >= threshold;
  }

  /**
   * Move job to DLQ
   */
  private async moveToDLQ(job: Job, reason: string): Promise<void> {
    if (!this.dlqConfig.enabled) {
      await this.store.failJob(job.id, reason);
      return;
    }

    // Add to DLQ
    const entry: DLQEntry = {
      job,
      reason,
      addedAt: new Date().toISOString(),
    };

    // Enforce DLQ size limit (remove oldest)
    while (this.dlq.length >= this.dlqConfig.maxSize) {
      this.dlq.shift();
    }

    this.dlq.push(entry);

    // Mark job as failed
    await this.store.failJob(job.id, `Moved to DLQ: ${reason}`);
    this.emit('job:dlq', job.id, reason);
  }

  /**
   * Get DLQ entries
   */
  getDLQ(): DLQEntry[] {
    return [...this.dlq];
  }

  /**
   * Clear DLQ
   */
  clearDLQ(): void {
    this.dlq = [];
    this.emit('dlq:cleared');
  }

  /**
   * Retry job from DLQ
   */
  async retryFromDLQ(jobId: string): Promise<Job | null> {
    const index = this.dlq.findIndex((e) => e.job.id === jobId);
    if (index === -1) {
      return null;
    }

    const entry = this.dlq[index];
    this.dlq.splice(index, 1);

    // Create new job with same params
    const newJob = await this.store.createJob({
      entrypoint: entry.job.entrypoint,
      params: entry.job.params,
      planHash: entry.job.planHash,
      priority: entry.job.priority,
      maxAttempts: entry.job.maxAttempts,
      refId: entry.job.refId,
    });

    this.emit('job:retried_from_dlq', newJob.id, jobId);
    return newJob;
  }

  /**
   * Clean expired DLQ entries
   */
  cleanExpiredDLQ(): number {
    const cutoff = Date.now() - this.dlqConfig.retentionDays * 24 * 60 * 60 * 1000;
    const before = this.dlq.length;

    this.dlq = this.dlq.filter((entry) => new Date(entry.addedAt).getTime() > cutoff);

    const removed = before - this.dlq.length;
    if (removed > 0) {
      this.emit('dlq:cleaned', removed);
    }

    return removed;
  }

  /**
   * Get queue statistics
   */
  async getStats(): Promise<QueueStats> {
    const jobStats = await this.store.getStats();

    return {
      queued: jobStats.queued,
      running: this.running.size,
      dlq: this.dlq.length,
      backpressureActive: this.isBackpressureActive(),
      utilizationPercent: Math.round((jobStats.queued / this.config.maxQueueSize) * 100),
    };
  }

  /**
   * Get running job IDs
   */
  getRunningJobs(): string[] {
    return [...this.running];
  }

  /**
   * Is queue started
   */
  isStarted(): boolean {
    return this.started;
  }

  /**
   * Get configuration
   */
  getConfig(): Readonly<QueueConfig> {
    return { ...this.config };
  }

  /**
   * Get DLQ configuration
   */
  getDLQConfig(): Readonly<DLQConfig> {
    return { ...this.dlqConfig };
  }
}
