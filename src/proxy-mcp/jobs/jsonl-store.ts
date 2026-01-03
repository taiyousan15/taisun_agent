/**
 * JSONL Job Store - P12 Stub
 *
 * File-based job store using JSONL format
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Job, JobStatus, JobStats, JobStoreAdapter } from './types';

/**
 * JSONL-based job store
 */
export class JsonlJobStore implements JobStoreAdapter {
  private jobs: Map<string, Job> = new Map();
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async init(): Promise<void> {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (fs.existsSync(this.filePath)) {
      try {
        const content = fs.readFileSync(this.filePath, 'utf-8');
        const lines = content.trim().split('\n').filter(Boolean);
        for (const line of lines) {
          try {
            const job = JSON.parse(line) as Job;
            this.jobs.set(job.id, job);
          } catch {
            // Skip invalid lines
          }
        }
      } catch {
        // File doesn't exist or is empty
      }
    }
  }

  async close(): Promise<void> {
    await this.flush();
  }

  private async flush(): Promise<void> {
    const lines = Array.from(this.jobs.values()).map((j) => JSON.stringify(j));
    fs.writeFileSync(this.filePath, lines.join('\n') + '\n', 'utf-8');
  }

  async get(id: string): Promise<Job | undefined> {
    return this.jobs.get(id);
  }

  async set(job: Job): Promise<void> {
    this.jobs.set(job.id, job);
    await this.flush();
  }

  async delete(id: string): Promise<boolean> {
    const result = this.jobs.delete(id);
    await this.flush();
    return result;
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
