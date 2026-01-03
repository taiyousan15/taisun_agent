/**
 * In-Memory Job Store - P12
 *
 * Simple in-memory job store for development and testing.
 */

import { Job, JobStatus, JobStoreAdapter, ListJobsOptions } from '../types';

/**
 * In-memory job store adapter
 */
export class InMemoryJobStore implements JobStoreAdapter {
  private jobs: Map<string, Job> = new Map();
  private jobsByKey: Map<string, string> = new Map(); // jobKey -> id

  async init(): Promise<void> {
    // Nothing to initialize
  }

  async get(id: string): Promise<Job | null> {
    return this.jobs.get(id) || null;
  }

  async getByKey(jobKey: string): Promise<Job | null> {
    const id = this.jobsByKey.get(jobKey);
    if (!id) return null;
    return this.jobs.get(id) || null;
  }

  async create(job: Job): Promise<Job> {
    // Check for duplicate job key
    if (this.jobsByKey.has(job.jobKey)) {
      const existingId = this.jobsByKey.get(job.jobKey)!;
      const existing = this.jobs.get(existingId);
      if (existing) {
        throw new Error(`Job with key ${job.jobKey} already exists (id: ${existingId})`);
      }
    }

    this.jobs.set(job.id, job);
    this.jobsByKey.set(job.jobKey, job.id);
    return job;
  }

  async update(id: string, updates: Partial<Job>): Promise<Job | null> {
    const job = this.jobs.get(id);
    if (!job) return null;

    const updated: Job = {
      ...job,
      ...updates,
      id: job.id, // Preserve ID
      jobKey: job.jobKey, // Preserve job key
      updatedAt: new Date().toISOString(),
    };

    this.jobs.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const job = this.jobs.get(id);
    if (!job) return false;

    this.jobsByKey.delete(job.jobKey);
    this.jobs.delete(id);
    return true;
  }

  async listByStatus(status: JobStatus, limit?: number): Promise<Job[]> {
    const jobs = Array.from(this.jobs.values())
      .filter((job) => job.status === status)
      .sort((a, b) => {
        // Priority order: critical > high > normal > low
        const priorityOrder = { critical: 0, high: 1, normal: 2, low: 3 };
        const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
        if (priorityDiff !== 0) return priorityDiff;
        // Then by createdAt
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });

    return limit ? jobs.slice(0, limit) : jobs;
  }

  async list(options?: ListJobsOptions): Promise<Job[]> {
    let jobs = Array.from(this.jobs.values());

    // Filter by status
    if (options?.status) {
      jobs = jobs.filter((job) => job.status === options.status);
    }

    // Sort
    const orderBy = options?.orderBy || 'createdAt';
    const orderDir = options?.orderDir || 'desc';

    jobs.sort((a, b) => {
      let cmp = 0;
      if (orderBy === 'priority') {
        const priorityOrder = { critical: 0, high: 1, normal: 2, low: 3 };
        cmp = priorityOrder[a.priority] - priorityOrder[b.priority];
      } else if (orderBy === 'createdAt') {
        cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      } else if (orderBy === 'updatedAt') {
        cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
      }
      return orderDir === 'asc' ? cmp : -cmp;
    });

    // Pagination
    const offset = options?.offset || 0;
    const limit = options?.limit;

    if (limit) {
      return jobs.slice(offset, offset + limit);
    }
    return jobs.slice(offset);
  }

  async countByStatus(status: JobStatus): Promise<number> {
    return Array.from(this.jobs.values()).filter((job) => job.status === status).length;
  }

  async getExpiringApprovals(thresholdMs: number): Promise<Job[]> {
    const now = Date.now();
    const threshold = now + thresholdMs;

    return Array.from(this.jobs.values()).filter((job) => {
      if (job.status !== 'waiting_approval') return false;
      if (!job.approvalExpiresAt) return false;
      const expiresAt = new Date(job.approvalExpiresAt).getTime();
      return expiresAt <= threshold;
    });
  }

  async close(): Promise<void> {
    this.jobs.clear();
    this.jobsByKey.clear();
  }

  /** Get all jobs (for testing) */
  getAllJobs(): Job[] {
    return Array.from(this.jobs.values());
  }

  /** Clear all jobs (for testing) */
  clear(): void {
    this.jobs.clear();
    this.jobsByKey.clear();
  }
}
