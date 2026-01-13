/**
 * Job Store Service - P12
 *
 * High-level job management with idempotency and status tracking.
 */

import * as crypto from 'crypto';
import {
  Job,
  JobStatus,
  JobStoreAdapter,
  JobStoreConfig,
  CreateJobOptions,
  JobResult,
  JobStats,
  ListJobsOptions,
} from './types';
import { InMemoryJobStore } from './stores/inmemory';
import { JsonlJobStore } from './stores/jsonl';

/**
 * Generate a unique job ID
 */
export function generateJobId(): string {
  return `job_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * Generate job key for idempotency
 */
export function generateJobKey(
  entrypoint: string,
  params: Record<string, unknown>,
  planHash?: string
): string {
  const paramsHash = crypto.createHash('sha256').update(JSON.stringify(params)).digest('hex');
  const parts = [entrypoint, paramsHash];
  if (planHash) {
    parts.push(planHash);
  }
  return parts.join(':');
}

/**
 * Job store service
 */
export class JobStoreService {
  private adapter: JobStoreAdapter;
  private initialized: boolean = false;

  constructor(adapter: JobStoreAdapter) {
    this.adapter = adapter;
  }

  /**
   * Create a job store from config
   */
  static fromConfig(config: JobStoreConfig): JobStoreService {
    let adapter: JobStoreAdapter;

    switch (config.type) {
      case 'inmemory':
        adapter = new InMemoryJobStore();
        break;
      case 'jsonl':
        if (!config.filePath) {
          throw new Error('filePath is required for jsonl store');
        }
        adapter = new JsonlJobStore(config.filePath, config.autoSaveIntervalMs);
        break;
      default:
        throw new Error(`Unknown store type: ${config.type}`);
    }

    return new JobStoreService(adapter);
  }

  /**
   * Initialize the store
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    await this.adapter.init();
    this.initialized = true;
  }

  /**
   * Create a new job (with idempotency check)
   */
  async createJob(options: CreateJobOptions): Promise<Job> {
    const jobKey = generateJobKey(options.entrypoint, options.params, options.planHash);

    // Check for existing job
    const existing = await this.adapter.getByKey(jobKey);
    if (existing) {
      // Return existing job if it's still active
      if (['queued', 'running', 'waiting_approval'].includes(existing.status)) {
        return existing;
      }
      // If completed/failed/canceled, allow creating a new one
      await this.adapter.delete(existing.id);
    }

    const now = new Date().toISOString();
    const approvalTtlHours = options.approvalTtlHours ?? 24;
    const approvalExpiresAt = new Date(
      Date.now() + approvalTtlHours * 60 * 60 * 1000
    ).toISOString();

    const job: Job = {
      id: generateJobId(),
      jobKey,
      status: 'queued',
      priority: options.priority ?? 'normal',
      entrypoint: options.entrypoint,
      params: options.params,
      planHash: options.planHash,
      refId: options.refId,
      attempts: 0,
      maxAttempts: options.maxAttempts ?? 3,
      createdAt: now,
      updatedAt: now,
      approvalExpiresAt,
    };

    return this.adapter.create(job);
  }

  /**
   * Get a job by ID
   */
  async getJob(id: string): Promise<Job | null> {
    return this.adapter.get(id);
  }

  /**
   * Get a job by job key
   */
  async getJobByKey(jobKey: string): Promise<Job | null> {
    return this.adapter.getByKey(jobKey);
  }

  /**
   * Update job status
   */
  async updateStatus(id: string, status: JobStatus, error?: string): Promise<Job | null> {
    const updates: Partial<Job> = { status };

    if (error) {
      updates.lastError = error;
    }

    if (status === 'running') {
      const job = await this.adapter.get(id);
      if (job && !job.startedAt) {
        updates.startedAt = new Date().toISOString();
      }
    }

    if (['succeeded', 'failed', 'canceled'].includes(status)) {
      updates.completedAt = new Date().toISOString();
    }

    return this.adapter.update(id, updates);
  }

  /**
   * Mark job as running and increment attempts
   */
  async startJob(id: string): Promise<Job | null> {
    const job = await this.adapter.get(id);
    if (!job) return null;

    return this.adapter.update(id, {
      status: 'running',
      attempts: job.attempts + 1,
      startedAt: job.startedAt || new Date().toISOString(),
    });
  }

  /**
   * Mark job as waiting for approval
   */
  async waitForApproval(id: string, issueId: number): Promise<Job | null> {
    return this.adapter.update(id, {
      status: 'waiting_approval',
      issueId,
    });
  }

  /**
   * Mark job as succeeded
   */
  async succeedJob(id: string, result: JobResult): Promise<Job | null> {
    return this.adapter.update(id, {
      status: 'succeeded',
      result,
      completedAt: new Date().toISOString(),
    });
  }

  /**
   * Mark job as failed
   */
  async failJob(id: string, error: string): Promise<Job | null> {
    return this.adapter.update(id, {
      status: 'failed',
      lastError: error,
      completedAt: new Date().toISOString(),
    });
  }

  /**
   * Cancel a job
   */
  async cancelJob(id: string, reason?: string): Promise<Job | null> {
    return this.adapter.update(id, {
      status: 'canceled',
      lastError: reason,
      completedAt: new Date().toISOString(),
    });
  }

  /**
   * Set job's memory reference ID
   */
  async setRefId(id: string, refId: string): Promise<Job | null> {
    return this.adapter.update(id, { refId });
  }

  /**
   * List jobs by status
   */
  async listByStatus(status: JobStatus, limit?: number): Promise<Job[]> {
    return this.adapter.listByStatus(status, limit);
  }

  /**
   * List all jobs
   */
  async list(options?: ListJobsOptions): Promise<Job[]> {
    return this.adapter.list(options);
  }

  /**
   * Get queued jobs (FIFO with priority)
   */
  async getQueuedJobs(limit?: number): Promise<Job[]> {
    return this.adapter.listByStatus('queued', limit);
  }

  /**
   * Get running jobs
   */
  async getRunningJobs(): Promise<Job[]> {
    return this.adapter.listByStatus('running');
  }

  /**
   * Get jobs waiting for approval
   */
  async getWaitingApprovalJobs(): Promise<Job[]> {
    return this.adapter.listByStatus('waiting_approval');
  }

  /**
   * Get jobs with expiring approvals
   */
  async getExpiringApprovals(thresholdMs: number = 60 * 60 * 1000): Promise<Job[]> {
    return this.adapter.getExpiringApprovals(thresholdMs);
  }

  /**
   * Check if job has exceeded max attempts
   */
  async hasExceededMaxAttempts(id: string): Promise<boolean> {
    const job = await this.adapter.get(id);
    if (!job) return false;
    return job.attempts >= job.maxAttempts;
  }

  /**
   * Get job statistics
   */
  async getStats(): Promise<JobStats> {
    const [queued, running, waiting_approval, succeeded, failed, canceled] = await Promise.all([
      this.adapter.countByStatus('queued'),
      this.adapter.countByStatus('running'),
      this.adapter.countByStatus('waiting_approval'),
      this.adapter.countByStatus('succeeded'),
      this.adapter.countByStatus('failed'),
      this.adapter.countByStatus('canceled'),
    ]);

    return {
      queued,
      running,
      waiting_approval,
      succeeded,
      failed,
      canceled,
      total: queued + running + waiting_approval + succeeded + failed + canceled,
    };
  }

  /**
   * Delete a job
   */
  async deleteJob(id: string): Promise<boolean> {
    return this.adapter.delete(id);
  }

  /**
   * Close the store
   */
  async close(): Promise<void> {
    await this.adapter.close();
    this.initialized = false;
  }

  /**
   * Get the adapter (for testing)
   */
  getAdapter(): JobStoreAdapter {
    return this.adapter;
  }
}

// Default store instance (can be replaced)
let defaultStore: JobStoreService | null = null;

/**
 * Get the default job store
 */
export function getJobStore(): JobStoreService {
  if (!defaultStore) {
    defaultStore = JobStoreService.fromConfig({ type: 'inmemory' });
  }
  return defaultStore;
}

/**
 * Set the default job store
 */
export function setJobStore(store: JobStoreService): void {
  defaultStore = store;
}

/**
 * Clear the default job store (for testing)
 */
export function clearJobStore(): void {
  defaultStore = null;
}
