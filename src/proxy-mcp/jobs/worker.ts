/**
 * Job Worker - P12
 *
 * Executes jobs from the queue:
 * - getNext → execute → complete loop
 * - --dry-run mode for testing
 * - planHash → Supervisor delegate
 */

import { EventEmitter } from 'events';
import { Job, JobResult } from './types';
import { JobQueue } from './queue';
import { JobStoreService } from './store';

/**
 * Worker configuration
 */
export interface WorkerConfig {
  /** Poll interval in ms */
  pollIntervalMs: number;
  /** Dry run mode (skip Claude calls) */
  dryRun: boolean;
  /** Maximum runtime per job in ms */
  maxJobRuntimeMs: number;
  /** Worker ID */
  workerId: string;
}

/**
 * Job executor function type
 */
export type JobExecutor = (
  job: Job,
  options: { dryRun: boolean }
) => Promise<JobExecutionResult>;

/**
 * Job execution result
 */
export interface JobExecutionResult {
  success: boolean;
  result?: JobResult;
  error?: string;
  /** Job needs approval (issue ID) */
  needsApproval?: number;
}

/**
 * Default executor (stub for testing)
 */
export const defaultExecutor: JobExecutor = async (job, options) => {
  if (options.dryRun) {
    return {
      success: true,
      result: {
        success: true,
        summary: `[DRY-RUN] Job ${job.id} would execute: ${job.entrypoint}`,
        data: { dryRun: true, params: job.params },
      },
    };
  }

  // Stub: In production, this would call Claude/Supervisor
  return {
    success: true,
    result: {
      success: true,
      summary: `Job ${job.id} executed successfully`,
    },
  };
};

/**
 * Worker statistics
 */
export interface WorkerStats {
  /** Jobs processed */
  processed: number;
  /** Jobs succeeded */
  succeeded: number;
  /** Jobs failed */
  failed: number;
  /** Jobs waiting approval */
  waitingApproval: number;
  /** Current job ID (if running) */
  currentJob: string | null;
  /** Worker uptime in ms */
  uptimeMs: number;
  /** Last processed at */
  lastProcessedAt: string | null;
}

/**
 * Job Worker
 */
export class JobWorker extends EventEmitter {
  private queue: JobQueue;
  private store: JobStoreService;
  private config: WorkerConfig;
  private executor: JobExecutor;
  private pollTimer: NodeJS.Timeout | null = null;
  private running: boolean = false;
  private currentJob: Job | null = null;
  private startedAt: number = 0;

  // Stats
  private processed: number = 0;
  private succeeded: number = 0;
  private failed: number = 0;
  private waitingApproval: number = 0;
  private lastProcessedAt: string | null = null;

  constructor(
    queue: JobQueue,
    store: JobStoreService,
    config: Partial<WorkerConfig> = {},
    executor: JobExecutor = defaultExecutor
  ) {
    super();
    this.queue = queue;
    this.store = store;
    this.config = {
      pollIntervalMs: config.pollIntervalMs ?? 1000,
      dryRun: config.dryRun ?? false,
      maxJobRuntimeMs: config.maxJobRuntimeMs ?? 5 * 60 * 1000, // 5 minutes
      workerId: config.workerId ?? `worker-${Date.now()}`,
    };
    this.executor = executor;
  }

  /**
   * Start the worker
   */
  start(): void {
    if (this.running) return;

    this.running = true;
    this.startedAt = Date.now();
    this.queue.start();

    // Start polling loop
    this.pollTimer = setInterval(() => {
      this.poll().catch((err) => {
        this.emit('error', err);
      });
    }, this.config.pollIntervalMs);

    this.emit('started', this.config.workerId);
  }

  /**
   * Stop the worker
   */
  async stop(): Promise<void> {
    if (!this.running) return;

    this.running = false;

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    // Wait for current job to complete
    if (this.currentJob) {
      this.emit('stopping', this.currentJob.id);
    }

    this.queue.stop();
    this.emit('stopped', this.config.workerId);
  }

  /**
   * Poll for next job
   */
  private async poll(): Promise<void> {
    if (!this.running || this.currentJob) return;

    const job = await this.queue.getNext();
    if (!job) return;

    this.currentJob = job;
    this.emit('job:processing', job);

    try {
      await this.executeJob(job);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.emit('job:error', job.id, error);
      await this.queue.complete(job.id, false, error);
      this.failed++;
    } finally {
      this.currentJob = null;
      this.processed++;
      this.lastProcessedAt = new Date().toISOString();
    }
  }

  /**
   * Execute a job
   */
  private async executeJob(job: Job): Promise<void> {
    // Execute with timeout
    const result = await Promise.race([
      this.executor(job, { dryRun: this.config.dryRun }),
      this.timeout(this.config.maxJobRuntimeMs),
    ]);

    if (!result) {
      // Timeout
      await this.queue.complete(job.id, false, 'Job timed out');
      this.failed++;
      this.emit('job:timeout', job.id);
      return;
    }

    if (result.needsApproval) {
      // Job needs human approval
      await this.queue.waitForApproval(job.id, result.needsApproval);
      this.waitingApproval++;
      this.emit('job:waiting_approval', job.id, result.needsApproval);
      return;
    }

    if (result.success && result.result) {
      await this.queue.complete(job.id, true, result.result);
      this.succeeded++;
      this.emit('job:succeeded', job.id, result.result);
    } else {
      await this.queue.complete(job.id, false, result.error || 'Unknown error');
      this.failed++;
      this.emit('job:failed', job.id, result.error);
    }
  }

  /**
   * Create a timeout promise
   */
  private timeout(ms: number): Promise<null> {
    return new Promise((resolve) => {
      setTimeout(() => resolve(null), ms);
    });
  }

  /**
   * Execute a single job manually (for testing)
   */
  async executeOnce(jobId: string): Promise<JobExecutionResult> {
    const job = await this.store.getJob(jobId);
    if (!job) {
      return { success: false, error: 'Job not found' };
    }

    if (job.status !== 'queued') {
      return { success: false, error: `Job is not queued (status: ${job.status})` };
    }

    // Start the job
    await this.store.startJob(jobId);
    this.emit('job:processing', job);

    try {
      const result = await this.executor(job, { dryRun: this.config.dryRun });

      if (result.needsApproval) {
        await this.queue.waitForApproval(jobId, result.needsApproval);
        return result;
      }

      if (result.success && result.result) {
        await this.store.succeedJob(jobId, result.result);
      } else {
        await this.store.failJob(jobId, result.error || 'Unknown error');
      }

      return result;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      await this.store.failJob(jobId, error);
      return { success: false, error };
    }
  }

  /**
   * Get worker statistics
   */
  getStats(): WorkerStats {
    return {
      processed: this.processed,
      succeeded: this.succeeded,
      failed: this.failed,
      waitingApproval: this.waitingApproval,
      currentJob: this.currentJob?.id || null,
      uptimeMs: this.running ? Date.now() - this.startedAt : 0,
      lastProcessedAt: this.lastProcessedAt,
    };
  }

  /**
   * Is worker running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Get worker ID
   */
  getWorkerId(): string {
    return this.config.workerId;
  }

  /**
   * Get configuration
   */
  getConfig(): Readonly<WorkerConfig> {
    return { ...this.config };
  }

  /**
   * Set executor (for testing)
   */
  setExecutor(executor: JobExecutor): void {
    this.executor = executor;
  }
}

/**
 * Create a supervisor executor
 * Integrates with the existing Supervisor for planHash-based jobs
 */
export function createSupervisorExecutor(
  supervisorRunner: (params: Record<string, unknown>, planHash?: string) => Promise<{
    success: boolean;
    summary: string;
    refId?: string;
    issueId?: number;
  }>
): JobExecutor {
  return async (job, options) => {
    if (options.dryRun) {
      return {
        success: true,
        result: {
          success: true,
          summary: `[DRY-RUN] Would run supervisor for ${job.entrypoint}`,
          data: { dryRun: true, planHash: job.planHash },
        },
      };
    }

    try {
      const result = await supervisorRunner(job.params, job.planHash);

      if (result.issueId) {
        // Needs approval
        return {
          success: true,
          needsApproval: result.issueId,
        };
      }

      return {
        success: result.success,
        result: {
          success: result.success,
          summary: result.summary,
          refId: result.refId,
        },
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  };
}
