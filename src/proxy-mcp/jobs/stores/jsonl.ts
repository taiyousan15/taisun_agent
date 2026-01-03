/**
 * JSONL Job Store - P12
 *
 * Persistent job store using JSONL file format.
 * Compatible with existing memory system design.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Job, JobStatus, JobStoreAdapter, ListJobsOptions } from '../types';

/**
 * JSONL job store adapter
 */
export class JsonlJobStore implements JobStoreAdapter {
  private jobs: Map<string, Job> = new Map();
  private jobsByKey: Map<string, string> = new Map();
  private filePath: string;
  private autoSaveIntervalMs: number;
  private autoSaveTimer: NodeJS.Timeout | null = null;
  private dirty: boolean = false;

  constructor(filePath: string, autoSaveIntervalMs: number = 5000) {
    this.filePath = filePath;
    this.autoSaveIntervalMs = autoSaveIntervalMs;
  }

  async init(): Promise<void> {
    // Ensure directory exists
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Load existing jobs
    if (fs.existsSync(this.filePath)) {
      await this.load();
    }

    // Start auto-save timer
    if (this.autoSaveIntervalMs > 0) {
      this.autoSaveTimer = setInterval(() => {
        if (this.dirty) {
          this.save().catch((err) => {
            console.error('[JsonlJobStore] Auto-save failed:', err);
          });
        }
      }, this.autoSaveIntervalMs);
    }
  }

  private async load(): Promise<void> {
    try {
      const content = fs.readFileSync(this.filePath, 'utf-8');
      const lines = content.split('\n').filter((line) => line.trim());

      for (const line of lines) {
        try {
          const job = JSON.parse(line) as Job;
          this.jobs.set(job.id, job);
          this.jobsByKey.set(job.jobKey, job.id);
        } catch {
          console.error('[JsonlJobStore] Failed to parse line:', line);
        }
      }
    } catch (err) {
      console.error('[JsonlJobStore] Failed to load:', err);
    }
  }

  private async save(): Promise<void> {
    const lines = Array.from(this.jobs.values()).map((job) => JSON.stringify(job));
    const content = lines.join('\n') + '\n';

    // Write to temp file first, then rename (atomic)
    const tempPath = this.filePath + '.tmp';
    fs.writeFileSync(tempPath, content, 'utf-8');
    fs.renameSync(tempPath, this.filePath);

    this.dirty = false;
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
    this.dirty = true;

    // Immediate save for new jobs
    await this.save();

    return job;
  }

  async update(id: string, updates: Partial<Job>): Promise<Job | null> {
    const job = this.jobs.get(id);
    if (!job) return null;

    const updated: Job = {
      ...job,
      ...updates,
      id: job.id,
      jobKey: job.jobKey,
      updatedAt: new Date().toISOString(),
    };

    this.jobs.set(id, updated);
    this.dirty = true;

    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const job = this.jobs.get(id);
    if (!job) return false;

    this.jobsByKey.delete(job.jobKey);
    this.jobs.delete(id);
    this.dirty = true;

    return true;
  }

  async listByStatus(status: JobStatus, limit?: number): Promise<Job[]> {
    const jobs = Array.from(this.jobs.values())
      .filter((job) => job.status === status)
      .sort((a, b) => {
        const priorityOrder = { critical: 0, high: 1, normal: 2, low: 3 };
        const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
        if (priorityDiff !== 0) return priorityDiff;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });

    return limit ? jobs.slice(0, limit) : jobs;
  }

  async list(options?: ListJobsOptions): Promise<Job[]> {
    let jobs = Array.from(this.jobs.values());

    if (options?.status) {
      jobs = jobs.filter((job) => job.status === options.status);
    }

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
    // Stop auto-save timer
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }

    // Final save
    if (this.dirty) {
      await this.save();
    }

    this.jobs.clear();
    this.jobsByKey.clear();
  }

  /** Force save (for testing) */
  async forceSave(): Promise<void> {
    await this.save();
  }

  /** Get file path (for testing) */
  getFilePath(): string {
    return this.filePath;
  }
}
