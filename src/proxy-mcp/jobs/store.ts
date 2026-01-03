/**
 * Job Store Service - P12 Stub
 *
 * Minimal implementation for SLO evaluation
 */

import type { Job, JobStatus, JobStats, JobStoreAdapter } from './types';

let globalStore: JobStoreService | null = null;

/**
 * In-memory job store for testing
 */
export class InMemoryJobStore implements JobStoreAdapter {
  private jobs: Map<string, Job> = new Map();

  async init(): Promise<void> {}
  async close(): Promise<void> {}

  async get(id: string): Promise<Job | undefined> {
    return this.jobs.get(id);
  }

  async set(job: Job): Promise<void> {
    this.jobs.set(job.id, job);
  }

  async delete(id: string): Promise<boolean> {
    return this.jobs.delete(id);
  }

  async list(limit = 100): Promise<Job[]> {
    return Array.from(this.jobs.values()).slice(0, limit);
  }

  async listByStatus(status: JobStatus, limit = 100): Promise<Job[]> {
    return Array.from(this.jobs.values())
      .filter((j) => j.status === status)
      .slice(0, limit);
  }

  async findByKey(key: string): Promise<Job | undefined> {
    return Array.from(this.jobs.values()).find((j) => j.key === key);
  }

  async getStats(): Promise<JobStats> {
    const jobs = Array.from(this.jobs.values());
    return {
      queued: jobs.filter((j) => j.status === 'queued').length,
      running: jobs.filter((j) => j.status === 'running').length,
      waiting_approval: jobs.filter((j) => j.status === 'waiting_approval').length,
      succeeded: jobs.filter((j) => j.status === 'succeeded').length,
      failed: jobs.filter((j) => j.status === 'failed').length,
      total: jobs.length,
    };
  }
}

/**
 * Job Store Service wrapper
 */
export class JobStoreService implements JobStoreAdapter {
  constructor(private adapter: JobStoreAdapter) {}

  async init(): Promise<void> {
    await this.adapter.init();
  }

  async close(): Promise<void> {
    await this.adapter.close();
  }

  async get(id: string): Promise<Job | undefined> {
    return this.adapter.get(id);
  }

  async set(job: Job): Promise<void> {
    return this.adapter.set(job);
  }

  async delete(id: string): Promise<boolean> {
    return this.adapter.delete(id);
  }

  async list(limit?: number, offset?: number): Promise<Job[]> {
    return this.adapter.list(limit, offset);
  }

  async listByStatus(status: JobStatus, limit?: number): Promise<Job[]> {
    return this.adapter.listByStatus(status, limit);
  }

  async findByKey(key: string): Promise<Job | undefined> {
    return this.adapter.findByKey(key);
  }

  async getStats(): Promise<JobStats> {
    return this.adapter.getStats();
  }
}

/**
 * Generate a unique job ID
 */
export function generateJobId(): string {
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Generate a job key from type and payload
 */
export function generateJobKey(type: string, payload: Record<string, unknown>): string {
  const payloadHash = JSON.stringify(payload);
  return `${type}:${Buffer.from(payloadHash).toString('base64').slice(0, 32)}`;
}

/**
 * Get the global job store
 */
export function getJobStore(): JobStoreService {
  if (!globalStore) {
    globalStore = new JobStoreService(new InMemoryJobStore());
  }
  return globalStore;
}

/**
 * Set the global job store
 */
export function setJobStore(store: JobStoreService): void {
  globalStore = store;
}

/**
 * Clear the global job store
 */
export function clearJobStore(): void {
  globalStore = null;
}
